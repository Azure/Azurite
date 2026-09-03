import { strict as assert } from "assert";
import { execFileSync } from "child_process";

describe("Mocha type compatibility @loki", function () {
  it("supports typed Mocha context @loki", function (this: Mocha.Context) {
    this.timeout(1000);
    assert.ok(this.test);
  });

  it("parses quoted and negative MOCHA_OPTIONS values @loki", function () {
    const output = execFileSync(
      process.execPath,
      [
        require.resolve("mocha/bin/mocha.js"),
        require.resolve("./fixtures/mochaOptions.fixture.js")
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          MOCHA_OPTIONS: '--grep "quoted target" --timeout -1'
        }
      }
    );

    assert.match(output, /1 passing/);
  });
});
