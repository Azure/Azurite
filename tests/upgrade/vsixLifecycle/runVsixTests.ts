import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests
} from "@vscode/test-electron";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { resolveVsixToTest } from "./resolveVsixToTest";
import { getFreePorts } from "../utils/freePorts";

/**
 * Drives the "install vsix, activate, start, stop" regression scenario:
 * downloads a real VS Code test instance, installs the target .vsix into an
 * isolated profile (exactly like a user running `code --install-extension`),
 * then launches it with a tiny driver extension whose test suite calls
 * `azurite.start` / `azurite.close` against the real, installed extension.
 */
async function main(): Promise<void> {
  const { vsixPath, tempDir: vsixTempDir } = await resolveVsixToTest();
  const userDataDir = mkdtempSync(join(tmpdir(), "azurite-vsix-userdata-"));
  const extensionsDir = mkdtempSync(join(tmpdir(), "azurite-vsix-extdir-"));
  const workspaceDir = mkdtempSync(join(tmpdir(), "azurite-vsix-workspace-"));

  try {
    const vscodeExecutablePath = await downloadAndUnzipVSCode();
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(
      vscodeExecutablePath,
      // Without this, the helper bakes its own default --user-data-dir/
      // --extensions-dir (pointing at .vscode-test/) into cliArgs, which
      // would then be duplicated ahead of - and could shadow - the temp
      // directories we pass explicitly below.
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
        // The VS Code CLI can resolve to a .cmd/.bat wrapper on Windows,
        // which Node refuses to spawn directly without shell: true.
        shell: process.platform === "win32"
      }
    );

    // Never probe the well-known default ports here - an already-running
    // developer Azurite instance would be mistaken for this installed VSIX
    // (VSCServerManagerBase.start() swallows EADDRINUSE and the lifecycle
    // suite's probe treats any HTTP response as success).
    const [blobPort, queuePort, tablePort] = await getFreePorts(3);

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: join(__dirname, "driverExtension"),
      extensionTestsPath: join(__dirname, "suite", "index.js"),
      extensionTestsEnv: {
        AZURITE_VSIX_LIFECYCLE_BLOB_PORT: String(blobPort),
        AZURITE_VSIX_LIFECYCLE_QUEUE_PORT: String(queuePort),
        AZURITE_VSIX_LIFECYCLE_TABLE_PORT: String(tablePort)
      },
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
    rmSync(workspaceDir, { recursive: true, force: true });
    if (vsixTempDir) {
      rmSync(vsixTempDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
