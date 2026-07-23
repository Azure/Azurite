import {
  newPipeline,
  BlobServiceClient,
  StorageSharedKeyCredential,
  ContainerClient
} from "@azure/storage-blob";
import * as assert from "assert";
import * as nodefs from "fs";
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
  let upgradeTestDbPath = "";
  let upgradeTestDbExtentPath = "";
  let upgradeBlobStoragePath = "";
  const cleanupTargets: string[] = [];
  const containerName = "upgrade-test-container";
  const blobName = "upgrade-test-blob.txt";
  const blobContent = "This data was created in Azurite 3.35.0";

  function allocatePaths(scope: string): void {
    const token = `${scope}_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2, 10)}`;

    upgradeTestDbPath = `__test_upgrade_db_blob__${token}.json`;
    upgradeTestDbExtentPath = `__test_upgrade_db_blob_extent__${token}.json`;
    upgradeBlobStoragePath = `__test_upgrade_blobstorage__${token}`;

    cleanupTargets.push(
      upgradeTestDbPath,
      upgradeTestDbExtentPath,
      upgradeBlobStoragePath
    );
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function removePathWithRetry(path: string): Promise<void> {
    try {
      await nodefs.promises.rm(path, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 100
      });
      return;
    } catch (err) {
      const code = (err as { code?: string })?.code;

      if (code === "ENOENT") {
        return;
      }

      // Last fallback for sporadic Windows lock races.
      await delay(200);
      await fs.remove(path);
    }
  }

  before(async () => {
    allocatePaths("suite");
  });

  beforeEach(() => {
    allocatePaths("case");
  });

  after(async () => {
    // Clean up test artifacts
    await cleanUpgradeArtifacts();
  });

  async function cleanUpgradeArtifacts(): Promise<void> {
    const paths = Array.from(new Set(cleanupTargets));

    for (const p of paths) {
      try {
        await removePathWithRetry(p);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== "EPERM") {
          throw err;
        }
      }
    }
  }

  function extractMd5Bytes(contentMD5: any): number[] {
    if (contentMD5 === undefined || contentMD5 === null) {
      return [];
    }

    if (contentMD5.type === "Buffer" && Array.isArray(contentMD5.data)) {
      return contentMD5.data;
    }

    if (Array.isArray(contentMD5)) {
      return contentMD5;
    }

    return Object.keys(contentMD5)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => contentMD5[k]);
  }

  function rewritePersistedMd5Shape(
    shape: "buffer-json" | "numeric-object" | "plain-array"
  ): void {
    const db = fs.readJSONSync(upgradeTestDbPath);
    const blobCollection = db.collections.find(
      (c: any) => c.name === "$BLOBS_COLLECTION$"
    );

    assert.ok(blobCollection !== undefined, "Blob collection should exist");

    for (const doc of blobCollection.data) {
      const existing = doc.properties?.contentMD5;
      const bytes = extractMd5Bytes(existing);
      assert.ok(bytes.length > 0, "Persisted contentMD5 bytes should exist");

      if (shape === "buffer-json") {
        doc.properties.contentMD5 = { type: "Buffer", data: bytes };
      } else if (shape === "numeric-object") {
        const numericObj: { [k: string]: number } = {};
        bytes.forEach((v, i) => {
          numericObj[String(i)] = v;
        });
        doc.properties.contentMD5 = numericObj;
      } else {
        doc.properties.contentMD5 = bytes;
      }
    }

    fs.writeJSONSync(upgradeTestDbPath, db);
  }

  function rewritePersistedMd5AsNull(): void {
    const db = fs.readJSONSync(upgradeTestDbPath);
    const blobCollection = db.collections.find(
      (c: any) => c.name === "$BLOBS_COLLECTION$"
    );

    assert.ok(blobCollection !== undefined, "Blob collection should exist");

    for (const doc of blobCollection.data) {
      doc.properties.contentMD5 = null;
    }

    fs.writeJSONSync(upgradeTestDbPath, db);
  }

  /**
   * Simulate the upgrade path
   * This test verifies that persisted data can be loaded after version changes
   */
  it("should upgrade without data loss", async () => {
    // PHASE 1: Simulate old version behavior - create initial data

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
      // Verify data was written
      const downloadResponse = await blockBlobClient.download(0);
      const downloadedStream = downloadResponse.readableStreamBody;
      assert.ok(
        downloadedStream !== undefined,
        "Downloaded stream should exist"
      );
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

    // PHASE 2: Simulate upgrade - load existing data

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

      // PHASE 3: Create new data with new version
      const newBlobName = "new-blob.txt";
      const newBlobContent = "This data was created in the new version";

      const newBlockBlobClient =
        containerClient2.getBlockBlobClient(newBlobName);
      await newBlockBlobClient.upload(newBlobContent, newBlobContent.length);

      // Verify new data
      const newDownloadResponse = await newBlockBlobClient.download(0);
      assert.ok(
        newDownloadResponse.readableStreamBody !== undefined,
        "New blob should be downloadable"
      );

      // Verify old data is still there
      const oldDownloadResponse = await blockBlobClient2.download(0);
      assert.ok(
        oldDownloadResponse.readableStreamBody !== undefined,
        "Old blob should still be accessible"
      );

      await server2.close();
    } finally {
      try {
        await server2.clean();
      } catch (err) {
        console.log("Note: Cleanup had an issue, but that's ok for this test");
      }
    }
  });

  /**
   * Test that verifies the specific scenario from issue #2672:
   * Multiple accounts with existing persisted data
   */
  it("should handle startup with multiple existing accounts and containers", async () => {
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
          const payload = `Content for ${containerName} blob ${i}`;
          const blobClient = containerClient.getBlockBlobClient(
            `blob-${i}.txt`
          );
          await blobClient.upload(payload, Buffer.byteLength(payload));
        }
      }
    } finally {
      await server3.close();
    }

    // Now restart and verify all data is still accessible
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

      await server4.close();
    } finally {
      try {
        await server4.clean();
      } catch (err) {
        console.log("Note: Cleanup had an issue, but that's ok for this test");
      }
    }
  });

  it("should load persisted metadata across legacy contentMD5 serialization formats", async () => {
    const shapes: Array<"buffer-json" | "numeric-object" | "plain-array"> = [
      "buffer-json",
      "numeric-object",
      "plain-array"
    ];

    for (const shape of shapes) {
      allocatePaths(`shape_${shape}`);

      const createPort =
        shape === "buffer-json"
          ? 11020
          : shape === "numeric-object"
            ? 11022
            : 11024;
      const loadPort = createPort + 1;
      const compatibilityContainer = `compat-${shape}`;
      const compatibilityBlob = `blob-${shape}.txt`;
      const compatibilityContent = `compatibility data for ${shape}`;

      const createConfig = new BlobConfiguration(
        "127.0.0.1",
        createPort,
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

      const createServer = new BlobServer(createConfig);
      await createServer.start();

      try {
        const baseURL = `http://127.0.0.1:${createPort}/devstoreaccount1`;
        const blobServiceClient = new BlobServiceClient(
          baseURL,
          newPipeline(
            new StorageSharedKeyCredential(
              EMULATOR_ACCOUNT_NAME,
              EMULATOR_ACCOUNT_KEY
            ),
            { retryOptions: { maxTries: 1 } }
          )
        );

        const containerClient = blobServiceClient.getContainerClient(
          compatibilityContainer
        );
        await containerClient.create();

        const blobClient =
          containerClient.getBlockBlobClient(compatibilityBlob);
        await blobClient.upload(
          compatibilityContent,
          compatibilityContent.length
        );
      } finally {
        await createServer.close();
      }

      rewritePersistedMd5Shape(shape);

      const loadConfig = new BlobConfiguration(
        "127.0.0.1",
        loadPort,
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

      const loadServer = new BlobServer(loadConfig);
      await loadServer.start();

      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.strictEqual(
          loadServer.getStatus(),
          ServerStatus.Running,
          `Server should remain Running for md5 shape ${shape}`
        );

        const loadBaseURL = `http://127.0.0.1:${loadPort}/devstoreaccount1`;
        const loadClient = new BlobServiceClient(
          loadBaseURL,
          newPipeline(
            new StorageSharedKeyCredential(
              EMULATOR_ACCOUNT_NAME,
              EMULATOR_ACCOUNT_KEY
            ),
            { retryOptions: { maxTries: 1 } }
          )
        );

        const containerClient = loadClient.getContainerClient(
          compatibilityContainer
        );
        const blobClient =
          containerClient.getBlockBlobClient(compatibilityBlob);
        const properties = await blobClient.getProperties();
        assert.ok(
          properties.contentMD5 !== undefined,
          `contentMD5 should be restored for md5 shape ${shape}`
        );
      } finally {
        await loadServer.close();
        await loadServer.clean();
      }
    }
  });

  it("should handle persisted null contentMD5 without startup failure", async () => {
    const createPort = 11026;
    const loadPort = 11027;
    const compatibilityContainer = "compat-null-md5";
    const compatibilityBlob = "blob-null-md5.txt";
    const compatibilityContent = "compatibility data for null md5";

    const createConfig = new BlobConfiguration(
      "127.0.0.1",
      createPort,
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

    const createServer = new BlobServer(createConfig);
    await createServer.start();

    try {
      const baseURL = `http://127.0.0.1:${createPort}/devstoreaccount1`;
      const blobServiceClient = new BlobServiceClient(
        baseURL,
        newPipeline(
          new StorageSharedKeyCredential(
            EMULATOR_ACCOUNT_NAME,
            EMULATOR_ACCOUNT_KEY
          ),
          { retryOptions: { maxTries: 1 } }
        )
      );

      const containerClient = blobServiceClient.getContainerClient(
        compatibilityContainer
      );
      await containerClient.create();

      const blobClient = containerClient.getBlockBlobClient(compatibilityBlob);
      await blobClient.upload(
        compatibilityContent,
        compatibilityContent.length
      );
    } finally {
      await createServer.close();
    }

    rewritePersistedMd5AsNull();

    const loadConfig = new BlobConfiguration(
      "127.0.0.1",
      loadPort,
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

    const loadServer = new BlobServer(loadConfig);
    await loadServer.start();

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.strictEqual(
        loadServer.getStatus(),
        ServerStatus.Running,
        "Server should remain Running for null contentMD5"
      );

      const loadBaseURL = `http://127.0.0.1:${loadPort}/devstoreaccount1`;
      const loadClient = new BlobServiceClient(
        loadBaseURL,
        newPipeline(
          new StorageSharedKeyCredential(
            EMULATOR_ACCOUNT_NAME,
            EMULATOR_ACCOUNT_KEY
          ),
          { retryOptions: { maxTries: 1 } }
        )
      );

      const containerClient = loadClient.getContainerClient(
        compatibilityContainer
      );
      const blobClient = containerClient.getBlockBlobClient(compatibilityBlob);
      const properties = await blobClient.getProperties();

      assert.strictEqual(
        properties.contentMD5,
        undefined,
        "Null persisted contentMD5 should be restored as undefined"
      );
    } finally {
      await loadServer.close();
      await loadServer.clean();
    }
  });
});
