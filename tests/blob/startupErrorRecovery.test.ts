import * as assert from "assert";
import * as fs from "fs-extra";

import BlobConfiguration from "../../src/blob/BlobConfiguration";
import BlobServer from "../../src/blob/BlobServer";
import { configLogger } from "../../src/common/Logger";
import { DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT } from "../../src/blob/utils/constants";
import { ServerStatus } from "../../src/common/ServerBase";

// Set true to enable debug log
configLogger(false);

describe("Blob Server Startup Error Recovery - Issue #2672 @loki", () => {
  const testDbPath = "__test_startup_error_db_blob__.json";
  const testDbExtentPath = "__test_startup_error_db_blob_extent__.json";
  const blobStoragePath = "__test_startup_error_blobstorage__";

  after(async () => {
    // Clean up test artifacts
    if (fs.existsSync(testDbPath)) {
      fs.removeSync(testDbPath);
    }
    if (fs.existsSync(testDbExtentPath)) {
      fs.removeSync(testDbExtentPath);
    }
    if (fs.existsSync(blobStoragePath)) {
      fs.removeSync(blobStoragePath);
    }
  });

  it("should start successfully when no persisted data exists (fresh start)", async () => {
    // Clean paths before test
    [testDbPath, testDbExtentPath, blobStoragePath].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.removeSync(p);
      }
    });

    const config = new BlobConfiguration(
      "127.0.0.1",
      0,
      DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
      testDbPath,
      testDbExtentPath,
      [
        {
          locationId: "test",
          locationPath: blobStoragePath,
          maxConcurrency: 10
        }
      ],
      false
    );

    const server = new BlobServer(config);

    try {
      // Should start without errors
      await server.start();
      assert.strictEqual(server.getStatus(), ServerStatus.Running);

      await server.close();
      assert.strictEqual(server.getStatus(), ServerStatus.Closed);
    } finally {
      await server.clean();
    }
  });

  it("should handle GC startup errors gracefully without throwing 'Cannot close server in status Starting'", async () => {
    // Clean paths before test
    [testDbPath, testDbExtentPath, blobStoragePath].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.removeSync(p);
      }
    });

    // Create a corrupted metadata file to simulate legacy data that causes GC errors
    // This simulates loading data from 3.35.0 that causes compatibility issues
    const corruptedMetadata = {
      schemaVersion: "3.35.0",
      data: {
        collections: [
          {
            name: "containers",
            binaryIndices: [{ name: "name", keyType: "string" }],
            data: [
              {
                // Minimal container entry - may cause issues during GC init
                name: "test-container",
                meta: { revision: 0, created: 1600000000000, version: 0 }
              }
            ]
          }
        ]
      }
    };

    // Write corrupted metadata to simulate legacy data
    fs.writeFileSync(testDbPath, JSON.stringify(corruptedMetadata, null, 2));

    const config = new BlobConfiguration(
      "127.0.0.1",
      0,
      DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
      testDbPath,
      testDbExtentPath,
      [
        {
          locationId: "test",
          locationPath: blobStoragePath,
          maxConcurrency: 10
        }
      ],
      false
    );

    const server = new BlobServer(config);
    try {
      // Attempt to start server
      await Promise.race([
        server.start(),
        // 10 second timeout - if it hangs, this will catch it
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error("Server startup timeout after 10 seconds")),
            10000
          )
        )
      ]);

      // If we get here, startup completed and should no longer be stuck in Starting.
      assert.notStrictEqual(
        server.getStatus(),
        ServerStatus.Starting,
        "Server should not remain in Starting state after startup completes"
      );

      // Try to close gracefully
      if (server.getStatus() === ServerStatus.Running) {
        await server.close();
      }
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }

      if (err.message.includes("Cannot close server in status Starting")) {
        assert.fail(
          `Bug not fixed: Server attempted to close while in Starting state. Error: ${err.message}`
        );
      }

      // Do not swallow startup failures such as timeout/hang.
      throw err;
    } finally {
      try {
        await server.clean();
      } catch {
        // Cleanup may fail if startup failed, that's ok
      }
    }
  });

  it("should successfully recover from concurrent startup and GC initialization", async () => {
    // Clean paths before test
    [testDbPath, testDbExtentPath, blobStoragePath].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.removeSync(p);
      }
    });

    const config = new BlobConfiguration(
      "127.0.0.1",
      0,
      DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
      testDbPath,
      testDbExtentPath,
      [
        {
          locationId: "test",
          locationPath: blobStoragePath,
          maxConcurrency: 10
        }
      ],
      false
    );

    const server = new BlobServer(config);

    try {
      // Start the server - GC manager will initialize concurrently during startup
      await server.start();

      // Verify server reached Running state
      assert.strictEqual(
        server.getStatus(),
        ServerStatus.Running,
        "Server should be in Running status after successful start"
      );

      // Give GC some time to run
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Close should work without issues
      await server.close();
      assert.strictEqual(server.getStatus(), ServerStatus.Closed);
    } finally {
      await server.clean();
    }
  });
});
