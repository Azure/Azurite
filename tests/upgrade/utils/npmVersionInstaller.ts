import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface InstalledAzurite {
  version: string;
  installDir: string;
  /** Path to the Node entry point (dist/src/azurite.js) of the installed package. */
  entryPoint: string;
}

/**
 * Installs a specific published version of the `azurite` npm package into an
 * isolated, throwaway directory so it can be run side-by-side with the local
 * build without polluting the workspace's own node_modules.
 */
export function installNpmVersion(version: string): InstalledAzurite {
  const installDir = mkdtempSync(
    join(tmpdir(), `azurite-upgrade-npm-${version}-`)
  );

  try {
    execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      [
        "install",
        `azurite@${version}`,
        "--prefix",
        installDir,
        "--no-save",
        "--no-audit",
        "--no-fund"
      ],
      // Node blocks spawning .cmd/.bat files directly on Windows unless
      // shell: true is set (see Node.js CVE-2024-27980) - without this,
      // execFileSync throws "spawnSync npm.cmd EINVAL".
      { stdio: "inherit", shell: process.platform === "win32" }
    );
  } catch (err) {
    rmSync(installDir, { recursive: true, force: true });
    throw err;
  }

  const entryPoint = join(
    installDir,
    "node_modules",
    "azurite",
    "dist",
    "src",
    "azurite.js"
  );

  return { version, installDir, entryPoint };
}
