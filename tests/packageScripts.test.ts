import * as assert from "assert";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface PackageJson {
  version: string;
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
  overrides?: Record<string, string>;
}

interface PackageLock {
  packages: Record<string, { version?: string }>;
}

interface LintStagedConfig {
  [glob: string]: string;
}

describe("Package scripts @loki", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8")
  ) as PackageJson;
  const packageLock = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../package-lock.json"), "utf8")
  ) as PackageLock;
  const lintStagedConfig = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../.lintstagedrc"), "utf8")
  ) as LintStagedConfig;

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

  it("resolves every overridden package to a single version", () => {
    const overrides = Object.keys(packageJson.overrides ?? {});
    assert.ok(
      overrides.length > 0,
      "Expected package.json to define at least one overrides entry"
    );
    for (const name of overrides) {
      const versions = new Set(
        Object.entries(packageLock.packages)
          .filter(([lockPath]) => lockPath.endsWith(`node_modules/${name}`))
          .map(([, entry]) => entry.version)
      );
      assert.strictEqual(
        versions.size,
        1,
        versions.size === 0
          ? `${name} is overridden but does not resolve anywhere in package-lock.json`
          : `${name} is overridden but resolves to multiple versions: ${[
              ...versions
            ].join(", ")}`
      );
    }
  });

  it("keeps lint-staged config in flat glob-to-command format", () => {
    assert.ok(!("linters" in lintStagedConfig) && !("ignore" in lintStagedConfig));
    const entries = Object.entries(lintStagedConfig);
    assert.ok(entries.length > 0);
    for (const [glob, command] of entries) {
      assert.ok(glob.length > 0);
      assert.strictEqual(typeof command, "string");
      assert.ok(command.trim().length > 0);
    }
  });
});
