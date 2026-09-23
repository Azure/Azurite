import * as assert from "assert";
import { EdmInt64 } from "../../../src/table/entity/EdmInt64";

describe("EdmInt64", () => {
  it("accepts values within the signed 64-bit integer range", () => {
    const values = [
      "-9223372036854775808",
      "-9007199254740992",
      "0",
      "9007199254740992",
      "9223372036854775807"
    ];

    for (const value of values) {
      assert.strictEqual(EdmInt64.validate(value), value);
    }
  });

  it("rejects values outside the signed 64-bit integer range", () => {
    const values = [
      "-9223372036854775809",
      "9223372036854775808",
      "18446744073709551615"
    ];

    for (const value of values) {
      assert.throws(() => EdmInt64.validate(value), RangeError);
    }
  });

  it("rejects strings that are not decimal integers", () => {
    const values = ["", "1.0", "1e3", "not-an-integer"];

    for (const value of values) {
      assert.throws(() => EdmInt64.validate(value), TypeError);
    }
  });
});
