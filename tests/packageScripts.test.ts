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

interface PackageLockJson {
  packages: Record<string, { version?: string }>;
}

function isAtLeast(version: string, minimum: string): boolean {
  const parse = (value: string) =>
    value.replace(/^[^\d]*/, "").split(".").map((part) => parseInt(part, 10));
  const actual = parse(version);
  const expected = parse(minimum);
  for (let i = 0; i < expected.length; i++) {
    const left = actual[i] ?? 0;
    const right = expected[i] ?? 0;
    if (left !== right) {
      return left > right;
    }
  }
  return true;
}

describe("Package scripts @loki", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8")
  ) as PackageJson;

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

  it("pins serialize-javascript to a version without the array-like DoS (GHSA-qj8w-gfj5-8c6v)", () => {
    const override = packageJson.overrides?.["serialize-javascript"];
    assert.ok(
      typeof override === "string",
      "Expected serialize-javascript to be pinned in overrides"
    );
    assert.ok(
      isAtLeast(override, "7.0.5"),
      `Expected serialize-javascript override >= 7.0.5, got: ${override}`
    );

    const packageLock = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../package-lock.json"), "utf8")
    ) as PackageLockJson;
    const resolved = Object.entries(packageLock.packages).filter(([name]) =>
      name.endsWith("node_modules/serialize-javascript")
    );
    assert.ok(
      resolved.length > 0,
      "Expected package-lock.json to resolve serialize-javascript"
    );
    for (const [name, entry] of resolved) {
      assert.ok(
        entry.version !== undefined && isAtLeast(entry.version, "7.0.5"),
        `${name} resolves to vulnerable version: ${entry.version}`
      );
    }
  });
});
