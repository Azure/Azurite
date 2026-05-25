import * as assert from "assert";
import { PassThrough } from "stream";
import { computeAndValidateTransactionalChecksums } from "../../src/blob/utils/utils";
import {
  convertRawHeadersToMetadata,
  getCRC64FromStream,
  getCRC64FromString,
  getMD5FromString
} from "../../src/common/utils/utils";

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

describe("CRC64", () => {
  // CRC-64/NVME check value for "123456789" per the CRC catalogue:
  // https://reveng.sourceforge.io/crc-catalogue/all.htm - the numeric value is
  // 0xae8b14860a799888, serialised on the wire as 8 little-endian bytes.
  it("getCRC64FromString matches the standard CRC-64/NVME check value for '123456789'", () => {
    const result = getCRC64FromString("123456789");
    const hex = Buffer.from(result).toString("hex");
    assert.strictEqual(hex, "8898790a86148bae");
  });

  it("getCRC64FromString produces an 8-byte result", () => {
    assert.strictEqual(getCRC64FromString("").length, 8);
    assert.strictEqual(getCRC64FromString("Hello, World!").length, 8);
  });

  it("getCRC64FromStream matches getCRC64FromString for the same data", async () => {
    const data = "The quick brown fox jumps over the lazy dog";
    const fromString = getCRC64FromString(data);

    const stream = new PassThrough();
    stream.end(Buffer.from(data));
    const fromStream = await getCRC64FromStream(stream);

    assert.deepStrictEqual(Buffer.from(fromString), Buffer.from(fromStream));
  });

  it("getCRC64FromStream produces identical results regardless of chunk boundaries", async () => {
    // Streaming data split across different chunk sizes must produce the same
    // CRC as a single contiguous buffer - chunk boundaries must not affect the result.
    const data = Buffer.from("Azure Blob Storage block integrity check");
    const expected = getCRC64FromString(data.toString());

    // Push as many 3-byte chunks (deliberately misaligned with any word boundary)
    const chunked = new PassThrough();
    for (let i = 0; i < data.length; i += 3) {
      chunked.push(data.slice(i, i + 3));
    }
    chunked.push(null);
    const fromChunked = await getCRC64FromStream(chunked);

    assert.deepStrictEqual(Buffer.from(fromChunked), Buffer.from(expected));
  });

  it("getCRC64FromString produces distinct values for inputs that differ by a single byte", () => {
    // Verifies the avalanche property: a one-byte change must alter the checksum.
    const base = Buffer.from("block content for crc64 test");
    const mutated = Buffer.from(base);
    mutated[mutated.length - 1] ^= 0x01;

    const crc1 = getCRC64FromString(base.toString("latin1"));
    const crc2 = getCRC64FromString(mutated.toString("latin1"));

    assert.notDeepStrictEqual(Buffer.from(crc1), Buffer.from(crc2));
  });
});

describe("Transactional Checksum Representation", () => {
  function makeBodyStream(body: string): PassThrough {
    const stream = new PassThrough();
    stream.end(Buffer.from(body));
    return stream;
  }

  it("accepts non-canonical base64 MD5 that decodes to the same 16 bytes", async () => {
    const body = "representation-md5-test";
    const md5 = await getMD5FromString(body);
    const canonical = Buffer.from(md5).toString("base64");
    const nonCanonical = canonical.replace(/=+$/, "");

    await assert.doesNotReject(async () => {
      await computeAndValidateTransactionalChecksums(
        makeBodyStream(body),
        { md5: nonCanonical },
        "test-md5-noncanonical"
      );
    });
  });

  it("accepts non-canonical base64 CRC64 that decodes to the same 8 bytes", async () => {
    const body = "representation-crc64-test";
    const crc64 = getCRC64FromString(body);
    const canonical = Buffer.from(crc64).toString("base64");
    const nonCanonical = canonical.replace(/=+$/, "");

    await assert.doesNotReject(async () => {
      await computeAndValidateTransactionalChecksums(
        makeBodyStream(body),
        { crc64: nonCanonical },
        "test-crc64-noncanonical"
      );
    });
  });

  it("rejects malformed base64 MD5 that decodes to fewer than 16 bytes", async () => {
    const body = "representation-md5-invalid-test";
    const malformedMd5 = Buffer.from([1, 2, 3, 4]).toString("base64").replace(/=+$/, "");

    await assert.rejects(
      async () => {
        await computeAndValidateTransactionalChecksums(
          makeBodyStream(body),
          { md5: malformedMd5 },
          "test-md5-invalid"
        );
      },
      {
        name: "StorageError",
        storageErrorCode: "InvalidMd5"
      }
    );
  });

  it("rejects malformed base64 CRC64 that decodes to fewer than 8 bytes", async () => {
    const body = "representation-crc64-invalid-test";
    const malformedCrc64 = Buffer.from([1, 2, 3, 4]).toString("base64").replace(/=+$/, "");

    await assert.rejects(
      async () => {
        await computeAndValidateTransactionalChecksums(
          makeBodyStream(body),
          { crc64: malformedCrc64 },
          "test-crc64-invalid"
        );
      },
      {
        name: "StorageError",
        storageErrorCode: "InvalidHeaderValue"
      }
    );
  });
});
