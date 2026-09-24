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

interface TsConfig {
  compilerOptions?: {
    types?: string[];
  };
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
  const tsConfig = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../tsconfig.json"), "utf8")
  ) as TsConfig;
  const ambientTypePackages = tsConfig.compilerOptions?.types ?? [];
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

  it("keeps lint script using the eslint CLI on TypeScript source", () => {
    assert.strictEqual(packageJson.scripts.lint, 'npx eslint "src/**/*.ts"');
    assert.ok(
      typeof packageJson.devDependencies.eslint === "string" &&
        packageJson.devDependencies.eslint.length > 0
    );
  });

  // eslint.config.js loads @typescript-eslint/eslint-plugin and
  // @typescript-eslint/parser side by side, and the plugin declares the parser
  // as a peer dependency, so both have to stay on compatible versions.
  const eslintTypeScriptPackages = [
    "@typescript-eslint/eslint-plugin",
    "@typescript-eslint/parser"
  ];

  const readInstalledPackageJson = (name: string) => {
    const packageJsonPath = path.resolve(
      __dirname,
      `../node_modules/${name}/package.json`
    );
    assert.ok(fs.existsSync(packageJsonPath), `${name} is not installed`);
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      version: string;
      peerDependencies?: Record<string, string>;
    };
  };

  // Minimal caret-range matcher: the repository does not depend on semver
  // directly, and every range checked here is a caret range or a list of
  // caret ranges. Anything else throws so an unexpected range form surfaces
  // as an explicit failure instead of a silent mismatch.
  const parseVersion = (version: string) => {
    const withoutBuild = version.split("+")[0];
    const separator = withoutBuild.indexOf("-");
    const core =
      separator === -1 ? withoutBuild : withoutBuild.slice(0, separator);
    const prerelease =
      separator === -1 ? undefined : withoutBuild.slice(separator + 1);
    const parts = core.split(".").map((part) => Number.parseInt(part, 10));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
      return undefined;
    }
    return { parts, prerelease };
  };

  const satisfiesCaretRange = (version: string, range: string) => {
    const parsed = parseVersion(version);
    if (parsed === undefined) {
      return false;
    }
    return range.split("||").some((comparator) => {
      const trimmed = comparator.trim();
      if (!trimmed.startsWith("^")) {
        throw new Error(
          `Unsupported range "${range}": only caret comparators are understood`
        );
      }
      // Prereleases only satisfy a caret range when the range names them, so
      // require an exact match instead of comparing release components.
      if (parsed.prerelease !== undefined) {
        return (
          trimmed.slice(1) === `${parsed.parts.join(".")}-${parsed.prerelease}`
        );
      }
      const boundVersion = parseVersion(trimmed.slice(1));
      if (boundVersion === undefined) {
        throw new Error(
          `Unsupported range "${range}": "${trimmed}" is not a caret comparator on a full version`
        );
      }
      const bound = boundVersion.parts;
      if (parsed.parts[0] !== bound[0]) {
        return false;
      }
      // Caret ranges below 1.0.0 only allow the right-most non-zero component
      // to increase, so pin the leading zero components before comparing.
      if (bound[0] === 0 && parsed.parts[1] !== bound[1]) {
        return false;
      }
      if (bound[0] === 0 && bound[1] === 0 && parsed.parts[2] !== bound[2]) {
        return false;
      }
      for (let index = 1; index < 3; index++) {
        if (parsed.parts[index] > bound[index]) {
          return true;
        }
        if (parsed.parts[index] < bound[index]) {
          return false;
        }
      }
      return true;
    });
  };

  it("installs a typescript-eslint parser that satisfies the plugin peer range", () => {
    const pluginPackageJson = readInstalledPackageJson(
      "@typescript-eslint/eslint-plugin"
    );
    const parserPackageJson = readInstalledPackageJson(
      "@typescript-eslint/parser"
    );
    const peerRange =
      pluginPackageJson.peerDependencies?.["@typescript-eslint/parser"];
    assert.ok(
      typeof peerRange === "string" && peerRange.length > 0,
      "@typescript-eslint/eslint-plugin must declare a parser peer dependency"
    );
    assert.ok(
      satisfiesCaretRange(parserPackageJson.version, peerRange),
      `@typescript-eslint/parser ${parserPackageJson.version} does not satisfy the plugin peer range ${peerRange}`
    );
  });

  it("keeps every resolved typescript-eslint lint package within its declared range", () => {
    for (const name of eslintTypeScriptPackages) {
      const declaredRange = packageJson.devDependencies[name];
      assert.ok(
        typeof declaredRange === "string" && declaredRange.length > 0,
        `${name} must be declared as a devDependency`
      );
      const versions = new Set(
        Object.entries(packageLock.packages)
          .filter(([lockPath]) => lockPath.endsWith(`node_modules/${name}`))
          .map(([, entry]) => entry.version)
      );
      assert.ok(
        versions.size > 0,
        `${name} has no resolved version in package-lock.json`
      );
      for (const version of versions) {
        assert.ok(
          typeof version === "string" &&
            satisfiesCaretRange(version, declaredRange),
          `${name} resolves to ${version}, which does not satisfy the declared range ${declaredRange}`
        );
      }
      const topLevelVersion =
        packageLock.packages[`node_modules/${name}`]?.version;
      assert.strictEqual(
        readInstalledPackageJson(name).version,
        topLevelVersion,
        `${name} installed version does not match package-lock.json`
      );
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
    assert.ok(
      !("linters" in lintStagedConfig) && !("ignore" in lintStagedConfig)
    );
    const entries = Object.entries(lintStagedConfig);
    assert.ok(entries.length > 0);
    for (const [glob, command] of entries) {
      assert.ok(glob.length > 0);
      assert.strictEqual(typeof command, "string");
      assert.ok(command.trim().length > 0);
    }
  });

  // TypeScript resolves each compilerOptions.types entry like a
  // /// <reference types="..." />, preferring @types/<name> and falling back to
  // a package that ships its own declarations (for example glob and minimatch).
  const typePackageCandidates = (name: string) => [`@types/${name}`, name];

  it("declares ambient type packages in tsconfig.json", () => {
    assert.ok(
      ambientTypePackages.length > 0,
      "Expected tsconfig.json to declare compilerOptions.types"
    );
  });

  it("resolves every tsconfig ambient type package to installed declarations", () => {
    for (const name of ambientTypePackages) {
      const packageJsonPath = typePackageCandidates(name)
        .map((packageName) =>
          path.resolve(__dirname, `../node_modules/${packageName}/package.json`)
        )
        .find((candidate) => fs.existsSync(candidate));
      if (packageJsonPath === undefined) {
        throw new Error(
          `tsconfig.json references "${name}" but neither @types/${name} nor ${name} is installed`
        );
      }
      const typePackageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8")
      ) as { types?: string; typings?: string };
      const declarationEntry =
        typePackageJson.types ?? typePackageJson.typings ?? "index.d.ts";
      const declarationBase = path.resolve(
        path.dirname(packageJsonPath),
        declarationEntry
      );
      assert.ok(
        [
          declarationBase,
          `${declarationBase}.d.ts`,
          path.join(declarationBase, "index.d.ts")
        ].some(
          (candidate) =>
            fs.existsSync(candidate) && fs.statSync(candidate).isFile()
        ),
        `${name} does not ship the declaration entry ${declarationEntry} required by tsconfig.json`
      );
    }
  });

  it("pins every tsconfig ambient type package to a top-level lockfile version", () => {
    for (const name of ambientTypePackages) {
      // Only top-level installs satisfy tsconfig ambient type resolution, so a
      // nested/transitive copy must not be accepted here.
      const version = typePackageCandidates(name)
        .map(
          (packageName) => packageLock.packages[`node_modules/${packageName}`]
        )
        .find((entry) => entry !== undefined)?.version;
      assert.ok(
        typeof version === "string" && version.length > 0,
        `${name} is referenced by tsconfig.json but has no top-level package-lock.json entry with a resolved version`
      );
    }
  });
});
