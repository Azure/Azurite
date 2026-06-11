import * as assert from "assert";
import { createHmac } from "crypto";
import {
  generateBlobSASSignatureWithUDK,
  IBlobSASSignatureValues
} from "../../../src/blob/authentication/IBlobSASSignatureValues";
import { BlobSASResourceType } from "../../../src/blob/authentication/BlobSASResourceType";

describe("Blob SAS signature values unit tests", () => {
  it("should throw when identifier is missing and both permissions/expiry are missing for 2025-07-05 UDK path, @loki", () => {
    const values: IBlobSASSignatureValues = {
      version: "2025-07-05",
      containerName: "container"
    };

    assert.throws(
      () =>
        generateBlobSASSignatureWithUDK(
          values,
          BlobSASResourceType.Blob,
          "devstoreaccount1",
          Buffer.from("unit-test-key")
        ),
      /Must provide 'permissions' and 'expiryTime'/
    );
  });

  it("should generate 2025-07-05 UDK{User Delegation Key} stringToSign with expected field order and signature for blob resource, @loki", () => {
    const values: IBlobSASSignatureValues = {
      version: "2025-07-05",
      containerName: "container-a",
      blobName: "blob-a.txt",
      permissions: "racwd",
      startTime: new Date("2025-01-01T00:00:00.000Z"),
      expiryTime: new Date("2025-01-02T00:00:00.000Z"),
      signedObjectId: "11111111-1111-1111-1111-111111111111",
      signedTenantId: "22222222-2222-2222-2222-222222222222",
      signedStartsOn: "2025-01-01T00:00:00Z",
      signedExpiresOn: "2025-01-02T00:00:00Z",
      signedService: "b",
      signedVersion: "2025-07-05",
      delegatedUserTenantId: "33333333-3333-3333-3333-333333333333",
      delegatedUserObjectId: "44444444-4444-4444-4444-444444444444",
      ipRange: { start: "10.0.0.1", end: "10.0.0.10" },
      protocol: "https",
      encryptionScope: "scope-a",
      cacheControl: "max-age=60",
      contentDisposition: "attachment",
      contentEncoding: "gzip",
      contentLanguage: "en-US",
      contentType: "text/plain"
    };
    const keyText = "unit-test-key-20250705";
    const key = Buffer.from(keyText);

    const [signature, stringToSign] = generateBlobSASSignatureWithUDK(
      values,
      BlobSASResourceType.Blob,
      "devstoreaccount1",
      key
    );

    const lines = stringToSign.split("\n");
    assert.strictEqual(lines.length, 26);
    assert.deepStrictEqual(lines, [
      "racwd",
      "2025-01-01T00:00:00Z",
      "2025-01-02T00:00:00Z",
      "/blob/devstoreaccount1/container-a/blob-a.txt",
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "2025-01-01T00:00:00Z",
      "2025-01-02T00:00:00Z",
      "b",
      "2025-07-05",
      "",
      "",
      "",
      "33333333-3333-3333-3333-333333333333",
      "44444444-4444-4444-4444-444444444444",
      "10.0.0.1-10.0.0.10",
      "https",
      "2025-07-05",
      "b",
      "",
      "scope-a",
      "max-age=60",
      "attachment",
      "gzip",
      "en-US",
      "text/plain"
    ]);

    const expectedSignature = createHmac("sha256", keyText)
      .update(stringToSign, "utf8")
      .digest("base64");
    assert.strictEqual(signature, expectedSignature);
  });

  it("should support string dates/ip and omit blob name for container resource in 2025-07-05 UDK path, @loki", () => {
    const values: IBlobSASSignatureValues = {
      version: "2025-07-05",
      containerName: "container-b",
      blobName: "ignored-for-container",
      permissions: "rl",
      startTime: "2025-03-10T12:00:00Z",
      expiryTime: "2025-03-11T12:00:00Z",
      signedObjectId: "oid",
      signedTenantId: "tid",
      signedStartsOn: "2025-03-10T12:00:00Z",
      signedExpiresOn: "2025-03-11T12:00:00Z",
      signedService: "b",
      signedVersion: "2025-07-05",
      ipRange: "192.168.0.1-192.168.0.8",
      contentType: "application/json"
    };

    const [, stringToSign] = generateBlobSASSignatureWithUDK(
      values,
      BlobSASResourceType.Container,
      "devstoreaccount1",
      Buffer.from("another-unit-test-key")
    );

    const lines = stringToSign.split("\n");
    assert.strictEqual(lines[1], "2025-03-10T12:00:00Z");
    assert.strictEqual(lines[2], "2025-03-11T12:00:00Z");
    assert.strictEqual(lines[3], "/blob/devstoreaccount1/container-b");
    assert.strictEqual(lines[15], "192.168.0.1-192.168.0.8");
    assert.strictEqual(lines[16], "");
    assert.strictEqual(lines[18], "c");
    assert.strictEqual(lines[13], "");
    assert.strictEqual(lines[14], "");
  });

  it("should not require permissions/expiry when identifier is provided for 2025-07-05 UDK path, @loki", () => {
    const values: IBlobSASSignatureValues = {
      version: "2025-07-05",
      containerName: "container-c",
      identifier: "policy-1"
    };

    assert.doesNotThrow(() =>
      generateBlobSASSignatureWithUDK(
        values,
        BlobSASResourceType.Container,
        "devstoreaccount1",
        Buffer.from("id-only-key")
      )
    );
  });
});
