import * as assert from "assert";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface PackageJson {
  version: string;
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
  overrides: Record<string, string>;
}

interface PackageLock {
  packages: Record<string, { version?: string }>;
}

/**
 * Compares two release versions (the `major.minor.patch` part of a semantic
 * version, ignoring any prerelease or build metadata).
 *
 * @returns a negative number when `left` is lower than `right`, 0 when they are
 * equal and a positive number when `left` is higher than `right`.
 */
function compareReleaseVersions(left: string, right: string): number {
  const parse = (version: string) =>
    version
      .replace(/^[^0-9]*/, "")
      .split(/[-+]/)[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);

  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let i = 0; i < 3; i++) {
    const diff = (leftParts[i] ?? 0) - (rightParts[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

describe("Package scripts @loki", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8")
  ) as PackageJson;
  const packageLock = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../package-lock.json"), "utf8")
  ) as PackageLock;

  it("expands package versions without changing Docker registry paths", () => {
    const expectedTag = `xstoreazurite.azurecr.io/public/azure-storage/azurite:${packageJson.version}`;
    // cross-env 10 is an ESM-only package with an "exports" map that doesn't
    // expose its bin scripts as require-resolvable subpaths. Resolve the
    // package's declared bin entry so the test follows the public CLI contract
    // instead of hard-coding an internal file layout.
    const crossEnvPackageJsonPath = path.resolve(
      __dirname,
      "../node_modules/cross-env/package.json"
    );
    const crossEnvPackageJson = JSON.parse(
      fs.readFileSync(crossEnvPackageJsonPath, "utf8")
    ) as { bin?: Record<string, string> };
    const crossEnvShellBin = crossEnvPackageJson.bin?.["cross-env-shell"];
    assert.ok(
      typeof crossEnvShellBin === "string" && crossEnvShellBin.length > 0,
      'cross-env package.json must declare a "cross-env-shell" bin entry'
    );
    const crossEnvShell = path.resolve(
      path.dirname(crossEnvPackageJsonPath),
      crossEnvShellBin
    );
    const result = spawnSync(
      process.execPath,
      [
        crossEnvShell,
        "node",
        "-p",
        "process.argv[1]",
        "xstoreazurite.azurecr.io/public/azure-storage/azurite:$npm_package_version"
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          npm_package_version: packageJson.version
        }
      }
    );

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout.trim(), expectedTag);
  });

  it("wraps each package version command without wrapping command chains", () => {
    const versionScripts = Object.entries(packageJson.scripts).filter(
      ([, command]) => command.includes("$npm_package_version")
    );

    assert.ok(versionScripts.length > 0);
    for (const [name, command] of versionScripts) {
      for (const segment of command.split(/\s+&&\s+/)) {
        if (segment.includes("$npm_package_version")) {
          assert.ok(
            segment.trim().startsWith("cross-env-shell "),
            `${name} has an unwrapped version reference: ${segment}`
          );
          assert.ok(
            !segment.trim().startsWith('cross-env-shell "'),
            `${name} wraps a command chain and may normalize registry paths`
          );
        }
      }
    }
  });

  it("keeps @types/mime on major version 4", () => {
    assert.ok(
      packageJson.devDependencies,
      "Expected package.json to define devDependencies"
    );
    const version = packageJson.devDependencies["@types/mime"];
    assert.ok(
      typeof version === "string",
      "Expected @types/mime to be present in devDependencies"
    );
    assert.ok(
      version.startsWith("^4.") || version.startsWith("4."),
      `Expected @types/mime major version 4, got: ${version}`
    );
  });

  it("resolves serialize-javascript to a version without the known DoS", () => {
    // serialize-javascript 5.0.0 - 7.0.4 are vulnerable to CPU exhaustion via
    // crafted array-like objects (GHSA-qj8w-gfj5-8c6v). It reaches the tree as
    // a transitive dependency of mocha, so it is pinned through an override.
    const firstFixedVersion = "7.0.5";

    const override = packageJson.overrides?.["serialize-javascript"];
    assert.ok(
      typeof override === "string",
      "Expected an overrides entry for serialize-javascript"
    );
    assert.ok(
      compareReleaseVersions(override, firstFixedVersion) >= 0,
      `Expected the serialize-javascript override to allow at least ${firstFixedVersion}, got: ${override}`
    );

    const resolved = Object.entries(packageLock.packages).filter(([name]) =>
      name.endsWith("node_modules/serialize-javascript")
    );
    assert.ok(
      resolved.length > 0,
      "Expected serialize-javascript to be present in package-lock.json"
    );
    for (const [name, entry] of resolved) {
      assert.ok(
        entry.version !== undefined &&
          compareReleaseVersions(entry.version, firstFixedVersion) >= 0,
        `${name} resolves to serialize-javascript ${entry.version}, expected at least ${firstFixedVersion}`
      );
    }
  });

  it("resolves every overridden package to a single version", () => {
    for (const name of Object.keys(packageJson.overrides ?? {})) {
      const versions = new Set(
        Object.entries(packageLock.packages)
          .filter(([lockPath]) => lockPath.endsWith(`node_modules/${name}`))
          .map(([, entry]) => entry.version)
      );
      assert.ok(
        versions.size <= 1,
        `${name} is overridden but resolves to multiple versions: ${[
          ...versions
        ].join(", ")}`
      );
    }
  });
});
