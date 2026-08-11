const assert = require("assert");
const http = require("http");
const vscode = require("vscode");

const EXTENSION_ID = "Azurite.azurite";
const BLOB_DEFAULT_PORT = 10000;
const QUEUE_DEFAULT_PORT = 10001;
const TABLE_DEFAULT_PORT = 10002;
const ALL_DEFAULT_PORTS = [BLOB_DEFAULT_PORT, QUEUE_DEFAULT_PORT, TABLE_DEFAULT_PORT];

function probeHttp(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/devstoreaccount1?comp=list", timeout: 3000 },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
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
    for (const port of ALL_DEFAULT_PORTS) {
      const isUp = await waitUntil(() => probeHttp(port), 30000, 1000);
      assert.ok(
        isUp,
        `Azurite service did not respond on port ${port} after azurite.start`
      );
    }
  });

  it("stops all services via the azurite.close command", async () => {
    await vscode.commands.executeCommand("azurite.close");
    for (const port of ALL_DEFAULT_PORTS) {
      const isDown = await waitUntil(
        async () => !(await probeHttp(port)),
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
