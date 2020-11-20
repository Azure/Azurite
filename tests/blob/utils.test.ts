import assert = require("assert");
import { convertRawHeadersToMetadata } from "../../src/common/utils/utils";

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
});
