import * as assert from "assert";
import { spawnSync } from "child_process";
import { version } from "../../package.json";

describe("CLI version reporting @loki", () => {
  const argsModule = require.resolve("../../src/common/utils/args");

  function runVersion(argument: string, exit: boolean) {
    return spawnSync(
      process.execPath,
      [
        "-r",
        "ts-node/register",
        "-e",
        `
          process.mainModule = undefined;
          const args = require(${JSON.stringify(argsModule)}).default;
          args.parse(["node", "azurite", ${JSON.stringify(argument)}], {
            exit: { help: true, version: ${exit} }
          });
          console.log("parsing continued");
        `
      ],
      { encoding: "utf8", timeout: 30000 }
    );
  }

  for (const argument of ["--version", "-v", "version"]) {
    it(`prints the package version and exits for ${argument} without a main module`, () => {
      const result = runVersion(argument, true);

      assert.ifError(result.error);
      assert.strictEqual(result.status, 0, result.stderr);
      assert.strictEqual(result.stdout.trim(), version);
    });
  }

  it("preserves the option to report the version without exiting", () => {
    const result = runVersion("--version", false);

    assert.ifError(result.error);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(result.stdout.trim().split(/\r?\n/), [
      version,
      "parsing continued"
    ]);
  });
});
