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

// Installing a published version via `npm install` is expensive (particularly
// on Windows runners, where it can take ~2 minutes per call). The blob/queue/
// table upgrade suites all install the same "latest published" version, so
// this process-wide cache lets them share a single install instead of paying
// that cost three times. See `rootHooks.ts` for the matching cleanup.
const installCache = new Map<string, InstalledAzurite>();

/**
 * Installs a specific published version of the `azurite` npm package into an
 * isolated, throwaway directory so it can be run side-by-side with the local
 * build without polluting the workspace's own node_modules. Repeated calls
 * for the same version within a process reuse the same install.
 */
export function installNpmVersion(version: string): InstalledAzurite {
  const cached = installCache.get(version);
  if (cached) {
    return cached;
  }

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

  const installed = { version, installDir, entryPoint };
  installCache.set(version, installed);
  return installed;
}

/** Removes every install cached by `installNpmVersion()` in this process. */
export function cleanupCachedNpmInstalls(): void {
  for (const installed of installCache.values()) {
    rmSync(installed.installDir, { recursive: true, force: true });
  }
  installCache.clear();
}
