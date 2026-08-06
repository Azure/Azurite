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
    const [cli, ...cliArgs] =
      resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

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

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: join(__dirname, "driverExtension"),
      extensionTestsPath: join(__dirname, "suite", "index.js"),
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
