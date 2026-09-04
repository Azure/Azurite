import { strict as assert } from "assert";

describe("Mocha type compatibility @loki", function () {
  it("supports typed Mocha context @loki", function (this: Mocha.Context) {
    this.timeout(1000);
    assert.ok(this.test);
  });
});
