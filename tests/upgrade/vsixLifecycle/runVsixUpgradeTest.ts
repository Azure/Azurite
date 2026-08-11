import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests
} from "@vscode/test-electron";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { AddressInfo, createServer } from "net";
import { tmpdir } from "os";
import { join } from "path";

import {
  packageLocalVsix,
  resolveMarketplaceVsixForUpgrade
} from "./resolveVsixToTest";

/**
 * Binds an ephemeral server to port 0 and returns whatever free port the OS
 * assigned, then releases it immediately. Used so the seed/verify phases
 * never collide with a developer's own already-running Azurite instance on
 * the well-known default ports (10000/10001/10002) - see
 * upgradeTestUtils.js.
 */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Installs `vsixPath` into a fresh, isolated VS Code user profile and runs
 * the given extensionTestsPath against `workspaceDir` opened as the sole
 * workspace folder (so `azurite.location` defaults to it - see
 * VSCEnvironment.location()). Mirrors runVsixTests.ts's single-session
 * lifecycle, but parameterized so it can be called twice - once per upgrade
 * phase - against the SAME workspaceDir.
 */
async function runVsixSession(
  vsixPath: string,
  workspaceDir: string,
  extensionTestsPath: string,
  extensionTestsEnv: NodeJS.ProcessEnv
): Promise<void> {
  const userDataDir = mkdtempSync(join(tmpdir(), "azurite-vsix-userdata-"));
  const extensionsDir = mkdtempSync(join(tmpdir(), "azurite-vsix-extdir-"));

  try {
    const vscodeExecutablePath = await downloadAndUnzipVSCode();
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(
      vscodeExecutablePath,
      { reuseMachineInstall: true }
    );

    execFileSync(
      cli,
      [
        ...cliArgs,
        "--install-extension",
        vsixPath,
        "--user-data-dir",
        userDataDir,
        "--extensions-dir",
        extensionsDir
      ],
      {
        stdio: "inherit",
        shell: process.platform === "win32"
      }
    );

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: join(__dirname, "driverExtension"),
      extensionTestsPath,
      extensionTestsEnv,
      launchArgs: [
        workspaceDir,
        "--user-data-dir",
        userDataDir,
        "--extensions-dir",
        extensionsDir
      ]
    });
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(extensionsDir, { recursive: true, force: true });
  }
}

/**
 * Drives the VSIX upgrade compatibility scenario, mirroring what
 * blobUpgrade/queueUpgrade/tableUpgrade.test.ts and dockerUpgrade.test.ts do
 * for the npm package and Docker image: seed blob/queue/table data with the
 * latest **published Marketplace** .vsix, then install the **local
 * (unreleased) build** .vsix over the same on-disk workspace and verify the
 * data survived. Run via `npm run test:upgrade:vsix` (this is the third of
 * three phases that script chains together).
 */
async function main(): Promise<void> {
  let workspaceDir: string | undefined;
  let oldVsixTempDir: string | undefined;
  let newVsixTempDir: string | undefined;

  try {
    workspaceDir = mkdtempSync(join(tmpdir(), "azurite-vsix-upgrade-data-"));
    const { vsixPath: oldVsixPath, tempDir: oldTempDir } =
      await resolveMarketplaceVsixForUpgrade();
    oldVsixTempDir = oldTempDir;
    const { vsixPath: newVsixPath, tempDir: newTempDir } = packageLocalVsix();
    newVsixTempDir = newTempDir;

    // Allocate free ports once here (not inside the seed/verify VS Code
    // processes) so both phases agree on the same ports without ever
    // touching the well-known defaults a developer's own Azurite instance
    // may already be listening on - see upgradeTestUtils.js.
    const portEnv = {
      AZURITE_VSIX_UPGRADE_BLOB_PORT: String(await getFreePort()),
      AZURITE_VSIX_UPGRADE_QUEUE_PORT: String(await getFreePort()),
      AZURITE_VSIX_UPGRADE_TABLE_PORT: String(await getFreePort())
    };

    // 1. Seed blob/queue/table data with the OLD (latest published Marketplace) vsix.
    await runVsixSession(
      oldVsixPath,
      workspaceDir,
      join(__dirname, "upgradeSuite", "seedIndex.js"),
      portEnv
    );

    // 2. Install the NEW (local build) vsix over the SAME workspace and verify.
    await runVsixSession(
      newVsixPath,
      workspaceDir,
      join(__dirname, "upgradeSuite", "verifyIndex.js"),
      portEnv
    );
  } finally {
    if (workspaceDir) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
    if (oldVsixTempDir) {
      rmSync(oldVsixTempDir, { recursive: true, force: true });
    }
    if (newVsixTempDir) {
      rmSync(newVsixTempDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
