import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests
} from "@vscode/test-electron";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Installs `vsixPath` into a fresh, isolated VS Code user profile and runs
 * `extensionTestsPath` against `workspaceDir` opened as the sole workspace
 * folder (so `azurite.location` defaults to it - see VSCEnvironment.location()).
 * Shared by the single-session lifecycle runner (runVsixTests.ts) and the
 * two-phase upgrade runner (runVsixUpgradeTest.ts), which calls this twice
 * against the SAME workspaceDir.
 */
export async function installAndRunVsixSession(
  vsixPath: string,
  workspaceDir: string,
  extensionTestsPath: string,
  extensionTestsEnv?: NodeJS.ProcessEnv
): Promise<void> {
  const userDataDir = mkdtempSync(join(tmpdir(), "azurite-vsix-userdata-"));
  const extensionsDir = mkdtempSync(join(tmpdir(), "azurite-vsix-extdir-"));

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

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: join(__dirname, "driverExtension"),
      extensionTestsPath,
      extensionTestsEnv: {
        // runTests inherits the parent process's env; clear AZURITE_ACCOUNTS
        // so a developer's/runner's own custom accounts can't replace the
        // default emulator credentials the seed/verify clients hardcode -
        // mirrors tests/upgrade/utils/processHarness.ts.
        AZURITE_ACCOUNTS: "",
        ...extensionTestsEnv
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
  }
}
