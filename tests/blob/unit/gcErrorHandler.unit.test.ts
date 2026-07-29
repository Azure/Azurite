import * as assert from "assert";

import { handleGCCriticalErrorClose } from "../../../src/common/GCCriticalErrorCloseHelper";
import ILogger from "../../../src/common/ILogger";
import { ServerStatus } from "../../../src/common/ServerBase";

describe("GC Error Handler Helper Unit Tests - Issue #2672 @loki", () => {
  function createTestLogger(events: string[]): ILogger {
    return {
      error: (message: string) => events.push(`error:${message}`),
      warn: (message: string) => events.push(`warn:${message}`),
      info: (message: string) => events.push(`info:${message}`),
      verbose: () => {
        // no-op for these tests
      },
      debug: () => {
        // no-op for these tests
      }
    };
  }

  it("waits for Running status, then closes", async () => {
    let serverStatus: ServerStatus = ServerStatus.Starting;
    let closeCalled = false;
    const events: string[] = [];

    const transitionToRunning = new Promise<void>((resolve) => {
      setTimeout(() => {
        serverStatus = ServerStatus.Running;
        events.push("transitioned_to_running");
        resolve();
      }, 20);
    });

    await Promise.all([
      transitionToRunning,
      handleGCCriticalErrorClose({
        serviceName: "Blob",
        getStatus: () => serverStatus,
        close: async () => {
          closeCalled = true;
          events.push("close_called");
        },
        logger: createTestLogger(events),
        waitIntervalMs: 5,
        maxAttempts: 20
      })
    ]);

    assert.strictEqual(closeCalled, true, "close should be called");
    assert.ok(
      events.some((e) =>
        e.includes("Shutting down Blob server due to GC critical error")
      ),
      "should log shutdown intent when status becomes Running"
    );
  });

  it("does not close if server transitions from Starting to Closed", async () => {
    let serverStatus: ServerStatus = ServerStatus.Starting;
    let closeCalled = false;
    const events: string[] = [];

    // Ensure this happens well after maxAttempts * waitIntervalMs so timeout logging is deterministic.
    setTimeout(() => {
      serverStatus = ServerStatus.Closed;
      events.push("transitioned_to_closed");
    }, 60);

    await handleGCCriticalErrorClose({
      serviceName: "Queue",
      getStatus: () => serverStatus,
      close: async () => {
        closeCalled = true;
      },
      logger: createTestLogger(events),
      waitIntervalMs: 5,
      maxAttempts: 3
    });

    assert.strictEqual(closeCalled, false, "close should not be called");
    assert.ok(
      events.some((e) => e.includes("did not transition to Running state")),
      "should log startup transition timeout"
    );
    assert.ok(
      events.some((e) =>
        e.includes("Queue server status is Closed (expected Running)")
      ),
      "should log status mismatch warning"
    );
  });

  it("swallows close errors and logs diagnostics", async () => {
    let serverStatus: ServerStatus = ServerStatus.Running;
    const events: string[] = [];

    await handleGCCriticalErrorClose({
      serviceName: "Blob",
      getStatus: () => serverStatus,
      close: async () => {
        throw new Error("synthetic close failure");
      },
      logger: createTestLogger(events),
      waitIntervalMs: 5,
      maxAttempts: 1
    });

    assert.ok(
      events.some((e) =>
        e.includes(
          "Blob server error during GC error handling: synthetic close failure"
        )
      ),
      "should log close diagnostics instead of throwing"
    );
  });
});
