const assert = require("assert");
const http = require("http");
const vscode = require("vscode");

const EXTENSION_ID = "Azurite.azurite";

// Ports are allocated once (as genuinely free ports) by runVsixTests.ts and
// handed to this suite via env vars - never Azurite's well-known defaults.
// Using the defaults would let an already-running developer Azurite instance
// be mistaken for the installed VSIX: azurite.start swallows EADDRINUSE
// (VSCServerManagerBase.start() only notifies onStartFail, it never rejects)
// and probeHttp() only checks that *some* HTTP server answers.
function requirePort(envVar) {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `${envVar} is not set - this suite must be launched via runVsixTests.ts, ` +
        "which allocates free ports and passes them through extensionTestsEnv."
    );
  }
  return Number(value);
}

const BLOB_PORT = requirePort("AZURITE_VSIX_LIFECYCLE_BLOB_PORT");
const QUEUE_PORT = requirePort("AZURITE_VSIX_LIFECYCLE_QUEUE_PORT");
const TABLE_PORT = requirePort("AZURITE_VSIX_LIFECYCLE_TABLE_PORT");
const ALL_PORTS = [BLOB_PORT, QUEUE_PORT, TABLE_PORT];

// Returns "up" (got an HTTP response), "down" (connection refused), or
// "timeout" - kept distinct from "down" so a slow/still-flushing listener
// isn't mistaken for a closed port (see waitUntil usage below).
function probeHttp(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/devstoreaccount1?comp=list", timeout: 3000 },
      (res) => {
        res.resume();
        resolve("up");
      }
    );
    req.on("error", () => resolve("down"));
    req.on("timeout", () => {
      req.destroy();
      resolve("timeout");
    });
  });
}

async function waitUntil(predicate, timeoutMs, intervalMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

describe("Azurite VSIX lifecycle", function () {
  this.timeout(120000);

  it("installs and activates the Azurite extension", async () => {
    // Isolated test profile only - keeps this run out of real usage telemetry.
    await vscode.workspace
      .getConfiguration("azurite")
      .update("disableTelemetry", true, vscode.ConfigurationTarget.Global);

    const azuriteConfig = vscode.workspace.getConfiguration("azurite");
    await azuriteConfig.update("blobPort", BLOB_PORT, vscode.ConfigurationTarget.Global);
    await azuriteConfig.update("queuePort", QUEUE_PORT, vscode.ConfigurationTarget.Global);
    await azuriteConfig.update("tablePort", TABLE_PORT, vscode.ConfigurationTarget.Global);

    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(
      ext,
      `Extension ${EXTENSION_ID} was not found - was it installed via --install-extension?`
    );
    await ext.activate();
    assert.strictEqual(ext.isActive, true, "Azurite extension did not activate");
  });

  it("starts all services via the azurite.start command", async () => {
    await vscode.commands.executeCommand("azurite.start");
    for (const port of ALL_PORTS) {
      const isUp = await waitUntil(async () => (await probeHttp(port)) === "up", 30000, 1000);
      assert.ok(
        isUp,
        `Azurite service did not respond on port ${port} after azurite.start`
      );
    }
  });

  it("stops all services via the azurite.close command", async () => {
    await vscode.commands.executeCommand("azurite.close");
    for (const port of ALL_PORTS) {
      // Only an explicit connection refusal counts as "down" - a request
      // timeout could just mean azurite.close's async LokiJS flush hasn't
      // finished yet, and must keep being polled rather than pass early.
      const isDown = await waitUntil(
        async () => (await probeHttp(port)) === "down",
        30000,
        1000
      );
      assert.ok(
        isDown,
        `Azurite service was still responding on port ${port} after azurite.close`
      );
    }
  });
});
