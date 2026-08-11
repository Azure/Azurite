import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Both the installed "old" package and the local build are executed under
// this same process's Node runtime (see AzuriteProcessHandle.start() in
// processHarness.ts, which forks with the default process.execPath) - there
// is no per-target Node version selection. logNodeEngineCompatibility() below
// only logs/warns about a mismatch; it never fails the install or the test.
const LOCAL_PACKAGE_JSON_PATH = join(__dirname, "..", "..", "..", "package.json");

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

  // Resolve the CLI entry point from the installed package's own `bin.azurite`
  // field rather than hardcoding its internal dist layout, so this suite
  // keeps working if a future release restructures the package internals
  // while preserving the public `azurite` CLI.
  const packageDir = join(installDir, "node_modules", "azurite");
  const pkg = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8")
  );
  const binEntry =
    typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.azurite;
  if (!binEntry) {
    throw new Error(
      `Installed azurite@${version} package.json has no "bin.azurite" entry`
    );
  }
  const entryPoint = join(packageDir, binEntry);

  logNodeEngineCompatibility(version, pkg.engines?.node);

  const installed = { version, installDir, entryPoint };
  installCache.set(version, installed);
  return installed;
}

/**
 * Logs the `engines.node` declared by the installed published version and by
 * the local build, alongside the Node runtime actually running this process.
 * Both targets share that one runtime (see the comment on
 * `LOCAL_PACKAGE_JSON_PATH` above), so a real mismatch wouldn't surface as a
 * clear error - it would show up as a confusing crash inside
 * `AzuriteProcessHandle.start()`. This is a best-effort warning only: it
 * parses the common `>=X.Y.Z` form and skips anything it can't confidently
 * read, rather than depending on a full semver-range library.
 */
function logNodeEngineCompatibility(
  installedVersion: string,
  installedEnginesNode: string | undefined
): void {
  const localEnginesNode: string | undefined = JSON.parse(
    readFileSync(LOCAL_PACKAGE_JSON_PATH, "utf8")
  ).engines?.node;
  const runningVersion = process.version;
  console.log(
    `[upgrade-test] Node engine check - azurite@${installedVersion} requires "${
      installedEnginesNode ?? "unspecified"
    }", local build requires "${
      localEnginesNode ?? "unspecified"
    }", running under ${runningVersion} (both targets share this one runtime).`
  );

  const runningMajor = Number(runningVersion.slice(1).split(".")[0]);
  const installedMinMajor = minRequiredMajor(installedEnginesNode);
  const localMinMajor = minRequiredMajor(localEnginesNode);
  if (
    (installedMinMajor !== undefined && runningMajor < installedMinMajor) ||
    (localMinMajor !== undefined && runningMajor < localMinMajor)
  ) {
    console.warn(
      `[upgrade-test] WARNING: Node ${runningVersion} may not satisfy the minimum engines.node required by azurite@${installedVersion} ("${installedEnginesNode}") and/or the local build ("${localEnginesNode}"). The npm/local targets are both run under this single Node runtime; if their requirements ever diverge, this suite will not catch it beyond this log line.`
    );
  }
}

/** Best-effort: pulls the leading minimum major version out of a `>=X.Y.Z`-style range, or undefined if it can't be parsed that way. */
function minRequiredMajor(range: string | undefined): number | undefined {
  const match = range?.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

/** Removes every install cached by `installNpmVersion()` in this process. */
export function cleanupCachedNpmInstalls(): void {
  for (const installed of installCache.values()) {
    rmSync(installed.installDir, { recursive: true, force: true });
  }
  installCache.clear();
}
