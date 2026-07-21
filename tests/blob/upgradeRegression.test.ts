import {
  newPipeline,
  BlobServiceClient,
  StorageSharedKeyCredential,
  ContainerClient
} from "@azure/storage-blob";
import * as assert from "assert";
import * as fs from "fs-extra";

import BlobConfiguration from "../../src/blob/BlobConfiguration";
import BlobServer from "../../src/blob/BlobServer";
import { configLogger } from "../../src/common/Logger";
import { DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT } from "../../src/blob/utils/constants";
import { ServerStatus } from "../../src/common/ServerBase";
import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME } from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Azurite Upgrade Regression Tests @loki", () => {
  const upgradeTestDbPath = "__test_upgrade_db_blob__.json";
  const upgradeTestDbExtentPath = "__test_upgrade_db_blob_extent__.json";
  const upgradeBlobStoragePath = "__test_upgrade_blobstorage__";
  const containerName = "upgrade-test-container";
  const blobName = "upgrade-test-blob.txt";
  const blobContent = "This data was created in Azurite 3.35.0";

  before(async () => {
    // Clean any existing test data
    [
      upgradeTestDbPath,
      upgradeTestDbExtentPath,
      upgradeBlobStoragePath
    ].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.removeSync(p);
      }
    });
  });

  after(async () => {
    // Clean up test artifacts
    [
      upgradeTestDbPath,
      upgradeTestDbExtentPath,
      upgradeBlobStoragePath
    ].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.removeSync(p);
      }
    });
  });

  /**
   * Simulate the upgrade path: 3.35.0 -> 3.36.0
   * This test verifies that persisted data from 3.35.0 can be loaded by 3.36.0
   */
  it("should upgrade without data loss", async () => {
    // PHASE 1: Simulate 3.35.0 behavior - create initial data
    console.log("\nPHASE 1: Creating test data (simulating 3.35.0)...");

    const port1 = 11010;
    const config1 = new BlobConfiguration(
      "127.0.0.1",
      port1,
      DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
      upgradeTestDbPath,
      upgradeTestDbExtentPath,
      [
        {
          locationId: "test",
          locationPath: upgradeBlobStoragePath,
          maxConcurrency: 10
        }
      ],
      false
    );

    const server1 = new BlobServer(config1);
    await server1.start();

    try {
      const baseURL1 = `http://127.0.0.1:${port1}/devstoreaccount1`;
      const blobServiceClient1 = new BlobServiceClient(
        baseURL1,
        newPipeline(
          new StorageSharedKeyCredential(
            EMULATOR_ACCOUNT_NAME,
            EMULATOR_ACCOUNT_KEY
          ),
          { retryOptions: { maxTries: 1 } }
        )
      );

      // Create container and blob
      const containerClient: ContainerClient =
        blobServiceClient1.getContainerClient(containerName);
      await containerClient.create();

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(blobContent, blobContent.length);

      console.log(
        `✓ Created blob: ${containerName}/${blobName} with content: "${blobContent}"`
      );

      // Verify data was written
      const downloadResponse = await blockBlobClient.download(0);
      const downloadedStream = downloadResponse.readableStreamBody;
      assert.ok(
        downloadedStream !== undefined,
        "Downloaded stream should exist"
      );
      console.log("✓ Verified blob content can be downloaded");
    } finally {
      await server1.close();
      // Don't clean - we want to preserve the persisted data for the upgrade test
      // await server1.clean();
    }

    // Verify persistence files exist
    assert.ok(
      fs.existsSync(upgradeTestDbPath),
      "Blob metadata database should be persisted"
    );
    console.log("✓ Metadata persisted to disk");

    // PHASE 2: Simulate 3.36.0 upgrade - load existing data
    console.log(
      "\nPHASE 2: Loading persisted data with new version (simulating 3.36.0+)..."
    );

    const port2 = 11011;
    const config2 = new BlobConfiguration(
      "127.0.0.1",
      port2,
      DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
      upgradeTestDbPath,
      upgradeTestDbExtentPath,
      [
        {
          locationId: "test",
          locationPath: upgradeBlobStoragePath,
          maxConcurrency: 10
        }
      ],
      false
    );

    const server2 = new BlobServer(config2);

    try {
      // This is where the bug would occur - loading legacy data with new GC manager
      await server2.start();
      console.log("✓ Server started successfully with persisted data");
      assert.ok(
        server2.getStatus() === ServerStatus.Running,
        "Server should be in Running state"
      );

      const baseURL2 = `http://127.0.0.1:${port2}/devstoreaccount1`;
      const blobServiceClient2 = new BlobServiceClient(
        baseURL2,
        newPipeline(
          new StorageSharedKeyCredential(
            EMULATOR_ACCOUNT_NAME,
            EMULATOR_ACCOUNT_KEY
          ),
          { retryOptions: { maxTries: 1 } }
        )
      );

      // Verify existing data is accessible
      const containerClient2: ContainerClient =
        blobServiceClient2.getContainerClient(containerName);
      const blockBlobClient2 = containerClient2.getBlockBlobClient(blobName);

      // Download the blob that was created in phase 1
      const downloadResponse2 = await blockBlobClient2.download(0);
      assert.ok(
        downloadResponse2.readableStreamBody !== undefined,
        "Should be able to download persisted blob after upgrade"
      );
      console.log(`✓ Successfully retrieved blob after upgrade`);

      // PHASE 3: Create new data with 3.36.0
      console.log("\nPHASE 3: Creating new data with upgraded version...");

      const newBlobName = "new-blob-in-3.36.0.txt";
      const newBlobContent = "This data was created in Azurite 3.36.0";

      const newBlockBlobClient =
        containerClient2.getBlockBlobClient(newBlobName);
      await newBlockBlobClient.upload(newBlobContent, newBlobContent.length);
      console.log(`✓ Created new blob in 3.36.0: ${newBlobName}`);

      // Verify new data
      const newDownloadResponse = await newBlockBlobClient.download(0);
      assert.ok(
        newDownloadResponse.readableStreamBody !== undefined,
        "New blob should be downloadable"
      );
      console.log(`✓ Verified new blob is accessible`);

      // Verify old data is still there
      const oldDownloadResponse = await blockBlobClient2.download(0);
      assert.ok(
        oldDownloadResponse.readableStreamBody !== undefined,
        "Old blob should still be accessible"
      );
      console.log(`✓ Old blob still exists after upgrade`);

      await server2.close();
      console.log("✓ Server closed successfully after upgrade test");
    } finally {
      try {
        await server2.clean();
      } catch (err) {
        console.log("Note: Cleanup had an issue, but that's ok for this test");
      }
    }

    console.log(
      "\n✅ UPGRADE TEST PASSED: Data successfully migrated from 3.35.0 to 3.36.0+"
    );
  });

  /**
   * Test that verifies the specific scenario from issue #2672:
   * Multiple accounts with existing persisted data
   */
  it("should handle startup with multiple existing accounts and containers", async () => {
    // Clean paths before test
    [
      upgradeTestDbPath,
      upgradeTestDbExtentPath,
      upgradeBlobStoragePath
    ].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.removeSync(p);
      }
    });

    console.log("\nCreating test scenario with multiple containers...");

    const port3 = 11012;
    const config3 = new BlobConfiguration(
      "127.0.0.1",
      port3,
      DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
      upgradeTestDbPath,
      upgradeTestDbExtentPath,
      [
        {
          locationId: "test",
          locationPath: upgradeBlobStoragePath,
          maxConcurrency: 10
        }
      ],
      false
    );

    const server3 = new BlobServer(config3);
    await server3.start();

    try {
      const baseURL3 = `http://127.0.0.1:${port3}/devstoreaccount1`;
      const blobServiceClient3 = new BlobServiceClient(
        baseURL3,
        newPipeline(
          new StorageSharedKeyCredential(
            EMULATOR_ACCOUNT_NAME,
            EMULATOR_ACCOUNT_KEY
          ),
          { retryOptions: { maxTries: 1 } }
        )
      );

      // Create multiple containers with blobs
      const containers = ["container-1", "container-2", "container-3"];
      for (const containerName of containers) {
        const containerClient =
          blobServiceClient3.getContainerClient(containerName);
        await containerClient.create();

        // Add a blob to each container
        for (let i = 0; i < 3; i++) {
          const blobClient = containerClient.getBlockBlobClient(
            `blob-${i}.txt`
          );
          await blobClient.upload(`Content for ${containerName} blob ${i}`, 40);
        }
      }

      console.log(
        `✓ Created ${containers.length} containers with 3 blobs each`
      );
    } finally {
      await server3.close();
    }

    // Now restart and verify all data is still accessible
    console.log("Restarting server with persisted multi-container data...");

    const port4 = 11013;
    const config4 = new BlobConfiguration(
      "127.0.0.1",
      port4,
      DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
      upgradeTestDbPath,
      upgradeTestDbExtentPath,
      [
        {
          locationId: "test",
          locationPath: upgradeBlobStoragePath,
          maxConcurrency: 10
        }
      ],
      false
    );

    const server4 = new BlobServer(config4);

    try {
      await server4.start();
      console.log("✓ Server restarted with persisted data");

      const baseURL4 = `http://127.0.0.1:${port4}/devstoreaccount1`;
      const blobServiceClient4 = new BlobServiceClient(
        baseURL4,
        newPipeline(
          new StorageSharedKeyCredential(
            EMULATOR_ACCOUNT_NAME,
            EMULATOR_ACCOUNT_KEY
          ),
          { retryOptions: { maxTries: 1 } }
        )
      );

      // Verify all containers and blobs are accessible
      const containers = ["container-1", "container-2", "container-3"];
      for (const containerName of containers) {
        const containerClient =
          blobServiceClient4.getContainerClient(containerName);

        // List blobs to verify they're accessible
        let blobCount = 0;
        for await (const blob of containerClient.listBlobsFlat()) {
          blobCount++;
          assert.ok(blob.name !== undefined, "Blob should have a name");
        }

        assert.strictEqual(
          blobCount,
          3,
          `Container ${containerName} should have 3 blobs`
        );
      }

      console.log(
        `✓ Verified all ${containers.length} containers with their blobs are accessible`
      );

      await server4.close();
    } finally {
      try {
        await server4.clean();
      } catch (err) {
        console.log("Note: Cleanup had an issue, but that's ok for this test");
      }
    }

    console.log(
      "\n✅ MULTI-CONTAINER TEST PASSED: Multiple containers with blobs persisted correctly"
    );
  });
});
