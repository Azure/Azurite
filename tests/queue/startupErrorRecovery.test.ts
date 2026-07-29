import * as assert from "assert";
import * as fs from "fs-extra";

import QueueConfiguration from "../../src/queue/QueueConfiguration";
import QueueServer from "../../src/queue/QueueServer";
import { configLogger } from "../../src/common/Logger";
import { DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT } from "../../src/queue/utils/constants";
import { ServerStatus } from "../../src/common/ServerBase";

// Set true to enable debug log
configLogger(false);

describe("Queue Server Startup Error Recovery - Issue #2672 @loki", () => {
  const testDbPath = "__test_queue_startup_error_db__.json";
  const testDbExtentPath = "__test_queue_startup_error_db_extent__.json";
  const queueStoragePath = "__test_queue_startup_error_storage__";

  async function startWithTimeout(server: QueueServer): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        server.start(),
        new Promise<void>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error("Server startup timeout after 10 seconds"));
          }, 10000);

          const nodeTimer = timeout as unknown as { unref?: () => void };
          if (typeof nodeTimer.unref === "function") {
            nodeTimer.unref();
          }
        })
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  after(async () => {
    // Clean up test artifacts
    [testDbPath, testDbExtentPath, queueStoragePath].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.removeSync(p);
      }
    });
  });

  it("Queue: should start successfully when no persisted data exists (fresh start)", async () => {
    // Clean paths before test
    [testDbPath, testDbExtentPath, queueStoragePath].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.removeSync(p);
      }
    });

    const config = new QueueConfiguration(
      "127.0.0.1",
      0,
      DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT,
      testDbPath,
      testDbExtentPath,
      [
        {
          locationId: "test",
          locationPath: queueStoragePath,
          maxConcurrency: 10
        }
      ],
      false
    );

    const server = new QueueServer(config);

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

  it("Queue: should handle GC startup errors gracefully without throwing 'Cannot close server in status Starting'", async () => {
    // Clean paths before test
    [testDbPath, testDbExtentPath, queueStoragePath].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.removeSync(p);
      }
    });

    // Create a corrupted metadata file to simulate legacy data
    const corruptedMetadata = {
      schemaVersion: "3.35.0",
      data: {
        collections: [
          {
            name: "queues",
            data: [
              {
                name: "test-queue",
                meta: { revision: 0, created: 1600000000000, version: 0 }
              }
            ]
          }
        ]
      }
    };

    fs.writeFileSync(testDbPath, JSON.stringify(corruptedMetadata, null, 2));

    const config = new QueueConfiguration(
      "127.0.0.1",
      0,
      DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT,
      testDbPath,
      testDbExtentPath,
      [
        {
          locationId: "test",
          locationPath: queueStoragePath,
          maxConcurrency: 10
        }
      ],
      false
    );

    const server = new QueueServer(config);

    try {
      await startWithTimeout(server);

      assert.notStrictEqual(
        server.getStatus(),
        ServerStatus.Starting,
        "Queue server should not remain in Starting state after startup completes"
      );

      if (server.getStatus() === ServerStatus.Running) {
        await server.close();
      }
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }

      if (err.message.includes("Cannot close server in status Starting")) {
        assert.fail(`Bug not fixed in Queue: ${err.message}`);
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
});
