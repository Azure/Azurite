import assert = require("assert");
import { convertRawHeadersToMetadata } from "../../src/common/utils/utils";
import {
  isNullOrWhitespace,
  parseDateFromAssumedString
} from "../../src/blob/utils/utils";

describe("Utils", () => {
  it("convertRawHeadersToMetadata should work", () => {
    // upper case, lower case keys/values
    const metadata = convertRawHeadersToMetadata([
      "x-ms-meta-Name1",
      "Value",
      "x-ms-meta-name2",
      "234",
      "x-ms-meta-name1",
      "Value",
      "X-Ms-Meta-Name3",
      "Value"
    ]);
    assert.deepStrictEqual(metadata, {
      Name1: "Value",
      name2: "234",
      name1: "Value",
      Name3: "Value"
    });
  });

  it("convertRawHeadersToMetadata should work with duplicated metadata", () => {
    const metadata = convertRawHeadersToMetadata([
      "x-ms-meta-name1",
      "Value",
      "x-ms-meta-name1",
      "234"
    ]);
    assert.deepStrictEqual(metadata, {
      name1: "Value,234"
    });
  });

  it("convertRawHeadersToMetadata should work with empty metadata", () => {
    const metadata = convertRawHeadersToMetadata([
      "x-ms-meta-Name1",
      "",
      "x-ms-meta-name1",
      "234"
    ]);
    assert.deepStrictEqual(metadata, {
      Name1: "",
      name1: "234"
    });
  });

  it("convertRawHeadersToMetadata should work with empty raw headers", () => {
    const metadata = convertRawHeadersToMetadata();
    assert.deepStrictEqual(metadata, undefined);
  });

  it("convertRawHeadersToMetadata should work with empty raw headers array", () => {
    const metadata = convertRawHeadersToMetadata([]);
    assert.deepStrictEqual(metadata, undefined);
  });

  describe("isNullOrWhitespace", () => {
    it("returns true for undefined", () => {
      assert.strictEqual(isNullOrWhitespace(undefined), true);
    });
    it("returns true for null", () => {
      assert.strictEqual(isNullOrWhitespace(null as any), true);
    });
    it("returns true for empty string", () => {
      assert.strictEqual(isNullOrWhitespace(""), true);
    });
    it("returns true for whitespace-only string", () => {
      assert.strictEqual(isNullOrWhitespace("  \t\n  "), true);
    });
    it("returns false for non-whitespace string", () => {
      assert.strictEqual(isNullOrWhitespace("abc"), false);
    });
  });

  describe("parseDateFromAssumedString", () => {
    it("returns undefined for undefined input", () => {
      assert.strictEqual(parseDateFromAssumedString(undefined), undefined);
    });
    it("returns same Date object when passed a Date", () => {
      const d = new Date();
      assert.strictEqual(parseDateFromAssumedString(d), d);
    });
    it("parses valid ISO string", () => {
      const iso = "2024-12-31T23:59:59.123Z";
      const d = parseDateFromAssumedString(iso)!;
      assert.ok(d instanceof Date);
      assert.strictEqual(d.toISOString(), iso);
    });
    it("returns undefined for whitespace string", () => {
      assert.strictEqual(parseDateFromAssumedString("   "), undefined);
    });
    it("returns undefined for non-date string", () => {
      assert.strictEqual(parseDateFromAssumedString("not-a-date"), undefined);
    });
    it("returns undefined for number input", () => {
      assert.strictEqual(parseDateFromAssumedString(123), undefined);
      assert.strictEqual(parseDateFromAssumedString(0), undefined);
      assert.strictEqual(parseDateFromAssumedString(-1), undefined);
    });
    it("returns undefined for boolean input", () => {
      assert.strictEqual(parseDateFromAssumedString(true), undefined);
      assert.strictEqual(parseDateFromAssumedString(false), undefined);
    });
    it("returns undefined for object input", () => {
      assert.strictEqual(parseDateFromAssumedString({}), undefined);
      assert.strictEqual(
        parseDateFromAssumedString({ date: "2024-01-01" }),
        undefined
      );
    });
    it("returns undefined for array input", () => {
      assert.strictEqual(parseDateFromAssumedString([]), undefined);
      assert.strictEqual(parseDateFromAssumedString(["2024-01-01"]), undefined);
    });
    it("returns undefined for null input", () => {
      assert.strictEqual(parseDateFromAssumedString(null), undefined);
    });
    it("returns undefined for function input", () => {
      const fn = function () {
        return "test";
      };
      assert.strictEqual(parseDateFromAssumedString(fn), undefined);
    });
  });
});
