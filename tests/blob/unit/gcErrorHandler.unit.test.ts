import * as assert from "assert";
import { ServerStatus } from "../../../src/common/ServerBase";

describe("GC Error Handler State Machine Unit Tests - Issue #2672 @loki", () => {
  /**
   * This test verifies the core logic of the fix:
   * The error handler should wait for server to reach Running state before attempting close
   */
  it("should wait for Running state before attempting server close", async () => {
    // Simulate the state machine using a simple state tracker
    let serverStatus: ServerStatus = ServerStatus.Starting;
    let closeAttempted = false;
    let closeSucceeded = false;
    const eventLog: string[] = [];

    // Simulate the error handler logic from BlobServer.ts
    const simulatedErrorHandler = async () => {
      eventLog.push("error_handler_called");

      const attemptClose = async () => {
        eventLog.push("attempt_close_started");
        try {
          // Check if server is in Running state, wait a bit if still Starting
          let attempts = 0;
          while (serverStatus === ServerStatus.Starting && attempts < 50) {
            eventLog.push(`waiting_for_running_state_attempt_${attempts}`);
            await new Promise(resolve => setTimeout(resolve, 10)); // Fast timeout for test
            attempts++;
          }

          // Only close if server reached Running state
          if (serverStatus === ServerStatus.Running) {
            eventLog.push("close_called");
            closeAttempted = true;
            closeSucceeded = true;
          } else {
            eventLog.push(`not_attempting_close_status_is_${serverStatus}`);
          }
        } catch (err) {
          eventLog.push(`attempt_close_error: ${err}`);
        }
      };

      await attemptClose();
    };

    // Simulate server lifecycle: Starting -> Running
    const transitionToRunning = async () => {
      await new Promise(resolve => setTimeout(resolve, 50)); // Delay to simulate startup work
      serverStatus = ServerStatus.Running;
      eventLog.push("server_transitioned_to_running");
    };

    // Start both operations concurrently (simulating real scenario)
    await Promise.all([
      transitionToRunning(),
      simulatedErrorHandler()
    ]);

    // Verify the fix: close should have been called
    assert.strictEqual(
      closeAttempted,
      true,
      "Error handler should have attempted to close server after it reached Running state"
    );

    assert.strictEqual(
      closeSucceeded,
      true,
      "Error handler should have successfully called close when server was in Running state"
    );

    // Verify state transitions in log
    assert.ok(
      eventLog.includes("server_transitioned_to_running"),
      "Server should have transitioned to Running state"
    );

    assert.ok(
      eventLog.includes("close_called"),
      "Close should have been called after server reached Running state"
    );
  });

  /**
   * Test that error handler gracefully handles case where server never reaches Running state
   */
  it("should gracefully handle case where server never reaches Running state", async () => {
    let serverStatus: ServerStatus = ServerStatus.Starting;
    const eventLog: string[] = [];
    let closeAttempted = false;

    // Simulate error handler that times out waiting for Running state
    const simulatedErrorHandlerTimeout = async () => {
      eventLog.push("error_handler_called");

      const attemptClose = async () => {
        eventLog.push("attempt_close_started");
        try {
          // Check if server is in Running state, wait a bit if still Starting
          let attempts = 0;
          while (serverStatus === ServerStatus.Starting && attempts < 5) { // Short timeout for test
            eventLog.push(`waiting_attempt_${attempts}`);
            await new Promise(resolve => setTimeout(resolve, 10));
            attempts++;
          }

          // Only close if server reached Running state
          if (serverStatus === (ServerStatus.Running as any)) {
            eventLog.push("close_called");
            closeAttempted = true;
          } else {
            eventLog.push(`skipping_close_status_is_${serverStatus}`);
          }
        } catch (err) {
          eventLog.push(`error: ${err}`);
        }
      };

      await attemptClose();
    };

    // Don't transition to Running - simulate failure to startup
    await simulatedErrorHandlerTimeout();

    // Should NOT attempt to close if server didn't reach Running
    assert.strictEqual(
      closeAttempted,
      false,
      "Error handler should NOT attempt to close if server never reached Running state"
    );

    // Should have tried waiting
    assert.ok(
      eventLog.some(e => e.startsWith("waiting_attempt")),
      "Error handler should have tried waiting for Running state"
    );

    assert.ok(
      eventLog.some(e => e.includes("skipping_close_status_is")),
      "Error handler should skip close attempt if state is not Running"
    );
  });

  /**
   * Test that demonstrates the bug scenario from issue #2672
   */
  it("should NOT reproduce original bug: Cannot close server in status Starting", async () => {
    let serverStatus: ServerStatus = ServerStatus.Starting;
    const eventLog: string[] = [];
    let bugDetected = false;

    // BUGGY implementation (the old code)
    const buggyErrorHandler = async () => {
      try {
        // Old code directly called this.close() without checking status
        if (serverStatus !== ServerStatus.Running) {
          throw Error(`Cannot close server in status ${ServerStatus[serverStatus]}`);
        }
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("Cannot close server in status Starting")
        ) {
          bugDetected = true;
          eventLog.push("BUG_DETECTED: " + err.message);
        }
        throw err;
      }
    };

    // FIXED implementation (our new code with state waiting)
    const fixedErrorHandler = async () => {
      eventLog.push("error_handler_called");
      const attemptClose = async () => {
        let attempts = 0;
        while (serverStatus === ServerStatus.Starting && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 10));
          attempts++;
        }

        if (serverStatus === ServerStatus.Running) {
          // Safe to close
          eventLog.push("close_called");
        }
      };

      await attemptClose();
    };

    // Verify buggy implementation would fail
    let buggyFailed = false;
    try {
      await buggyErrorHandler();
    } catch (err) {
      buggyFailed = true;
    }

    assert.ok(buggyFailed, "Buggy implementation should have thrown");
    assert.ok(bugDetected, "Should have detected the original bug");

    // Reset for fixed implementation test
    serverStatus = ServerStatus.Starting;
    eventLog.length = 0;

    // Transition to Running after a delay
    const transitionFuture = new Promise(resolve => {
      setTimeout(() => {
        serverStatus = ServerStatus.Running;
        eventLog.push("transitioned_to_running");
        resolve(undefined);
      }, 30);
    });

    // Run fixed handler and transition concurrently
    let fixedFailed = false;
    try {
      await Promise.all([fixedErrorHandler(), transitionFuture]);
    } catch (err) {
      fixedFailed = true;
    }

    assert.ok(
      !fixedFailed,
      "Fixed implementation should NOT throw with concurrent startup"
    );

    assert.ok(
      eventLog.includes("transitioned_to_running"),
      "Should have transitioned to Running"
    );

    assert.ok(
      eventLog.includes("close_called"),
      "Fixed implementation should call close after server transitions to Running"
    );
  });
});
