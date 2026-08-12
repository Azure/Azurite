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

  it("resolves @opentelemetry/core to a version without the baggage extract flaw", () => {
    // GHSA-8988-4f7v-96qf / CVE-2026-54285: W3CBaggagePropagator.extract() did
    // not enforce the W3C baggage size limits before 2.8.0.
    assert.strictEqual(
      packageJson.overrides["@opentelemetry/core"],
      "^2.8.0",
      "Expected package.json to override @opentelemetry/core to ^2.8.0 or later"
    );

    const packageLock = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../package-lock.json"), "utf8")
    ) as PackageLock;

    const resolved = Object.entries(packageLock.packages).filter(([name]) =>
      name.endsWith("node_modules/@opentelemetry/core")
    );
    assert.ok(
      resolved.length > 0,
      "Expected package-lock.json to resolve @opentelemetry/core"
    );

    for (const [name, entry] of resolved) {
      const version = entry.version ?? "";
      const [major, minor] = version.split(".").map(part => parseInt(part, 10));
      assert.ok(
        major > 2 || (major === 2 && minor >= 8),
        `${name} resolves to vulnerable @opentelemetry/core ${version}, expected >= 2.8.0`
      );
    }
  });
});
