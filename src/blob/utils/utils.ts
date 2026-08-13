import { createHmac } from "crypto";
import { createWriteStream, PathLike } from "fs";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { HeaderConstants, USERDELEGATIONKEY_SIGNING_SEED } from "./constants";
import { BlobTag, BlobTags } from "@azure/storage-blob";
import { TagContent } from "../persistence/QueryInterpreter/QueryNodes/IQueryNode";
import { computeTransactionalChecksums } from "../../common/utils/utils";

function decodeBase64HeaderValue(value: string): Buffer | undefined {
  if (value.length === 0) {
    return Buffer.alloc(0);
  }

  // Allow missing padding, but reject non-base64 characters and misplaced '='.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return undefined;
  }

  const firstPadding = value.indexOf("=");
  if (firstPadding !== -1 && !/^=+$/.test(value.slice(firstPadding))) {
    return undefined;
  }

  const unpadded = value.replace(/=+$/, "");
  // Base64 payload length modulo 4 can only be 0, 2, or 3.
  if (unpadded.length % 4 === 1) {
    return undefined;
  }

  const normalized = unpadded + "=".repeat((4 - (unpadded.length % 4)) % 4);
  const decoded = Buffer.from(normalized, "base64");

  // Ensure the supplied payload is a valid base64 encoding for decoded bytes.
  if (decoded.toString("base64").replace(/=+$/, "") !== unpadded) {
    return undefined;
  }

  return decoded;
}

/**
 * Decodes an MD5 header value (base64 string or raw Uint8Array) and returns
 * whether the result is exactly 16 bytes - the only shape real Azure accepts.
 * Wrong-length values on Content-MD5, transactionalContentMD5, or
 * x-ms-blob-content-md5 are all rejected with InvalidMd5 (verified live).
 */
export function isValidMd5Header(value: Uint8Array | string): boolean {
  const bytes =
    typeof value === "string"
      ? decodeBase64HeaderValue(value)
      : Buffer.from(value);
  return bytes !== undefined && bytes.length === 16;
}

/**
 * Computes MD5 and/or CRC-64/NVME from a stream in a single pass and validates
 * against the request-supplied values. Throws Md5Mismatch / Crc64Mismatch
 * (HTTP 400) on mismatch - the documented Azure Storage error codes for
 * transactional integrity failures.
 *
 * Rejects requests that supply both checksums with `BothCrc64AndMd5HeaderPresent`
 * (HTTP 400), matching the real Azure service contract.
 *
 * A checksum is computed when its `expected` value is provided, OR when the
 * corresponding `force` flag is set (for callers that need the value for
 * non-validation purposes - e.g. Put Blob persists MD5 as a blob property).
 */
export async function computeAndValidateTransactionalChecksums(
  stream: NodeJS.ReadableStream,
  expected: { md5?: Uint8Array | string; crc64?: Uint8Array | string },
  contextId: string | undefined,
  force?: { md5?: boolean; crc64?: boolean }
): Promise<{ md5?: Uint8Array; crc64?: Uint8Array }> {
  if (expected.md5 !== undefined && expected.crc64 !== undefined) {
    throw StorageErrorFactory.getBothCrc64AndMd5HeaderPresent(contextId);
  }
  if (expected.md5 !== undefined && !isValidMd5Header(expected.md5)) {
    throw StorageErrorFactory.getInvalidMd5(contextId);
  }
  const expectedCrc64RawHeader =
    typeof expected.crc64 === "string"
      ? expected.crc64
      : expected.crc64 !== undefined
        ? Buffer.from(expected.crc64).toString("base64")
        : undefined;

  const expectedCrc64Bytes =
    expected.crc64 === undefined
      ? undefined
      : typeof expected.crc64 === "string"
        ? decodeBase64HeaderValue(expected.crc64)
        : Buffer.from(expected.crc64);

  if (
    expected.crc64 !== undefined &&
    (expectedCrc64Bytes === undefined || expectedCrc64Bytes.length < 8)
  ) {
    // CRC-64/NVME is a 64-bit value; the wire format is base64-encoded bytes.
    // Verified against real Azure: <8 bytes is rejected as InvalidHeaderValue;
    // >=8 bytes is accepted at header-validation and falls through to a value
    // comparison (which then surfaces as Crc64Mismatch if it doesn't match).
    throw StorageErrorFactory.getInvalidHeaderValue(contextId, {
      HeaderName: HeaderConstants.X_MS_CONTENT_CRC64,
      HeaderValue: expectedCrc64RawHeader ?? ""
    });
  }
  const calculated = await computeTransactionalChecksums(
    stream,
    expected,
    force
  );

  if (expected.md5 !== undefined) {
    const expectedMd5Bytes =
      typeof expected.md5 === "string"
        ? decodeBase64HeaderValue(expected.md5)!
        : Buffer.from(expected.md5);
    const calculatedMd5Bytes = Buffer.from(calculated.md5!);
    const expectedMd5 = expectedMd5Bytes.toString("base64");
    const calculatedMd5 = calculatedMd5Bytes.toString("base64");
    if (expectedMd5 !== calculatedMd5) {
      throw StorageErrorFactory.getMd5Mismatch(
        contextId,
        expectedMd5,
        calculatedMd5
      );
    }
  }
  if (expectedCrc64Bytes !== undefined) {
    const calculatedCrc64Bytes = Buffer.from(calculated.crc64!);
    const expectedCrc64 = expectedCrc64Bytes.toString("base64");
    const calculatedCrc64 = calculatedCrc64Bytes.toString("base64");
    if (expectedCrc64 !== calculatedCrc64) {
      throw StorageErrorFactory.getCrc64Mismatch(
        contextId,
        expectedCrc64,
        calculatedCrc64
      );
    }
  }

  return calculated;
}

export function checkApiVersion(
  inputApiVersion: string,
  validApiVersions: Array<string>,
  requestId: string
): void {
  if (!validApiVersions.includes(inputApiVersion)) {
    throw StorageErrorFactory.getInvalidAPIVersion(requestId, inputApiVersion);
  }
}

export async function streamToLocalFile(
  stream: NodeJS.ReadableStream,
  path: PathLike
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const writeStream = createWriteStream(path);
    stream
      .on("error", reject)
      // .on("end", resolve)
      .pipe(writeStream)
      .on("close", resolve)
      .on("error", reject);
  });
}

/**
 * Default range value [0, Infinite] will be returned if all parameters not provided.
 *
 * @export
 * @param {string} [rangeHeaderValue]
 * @param {string} [xMsRangeHeaderValue]
 * @returns {[number, number]}
 */
export function deserializeRangeHeader(
  rangeHeaderValue?: string,
  xMsRangeHeaderValue?: string
): [number, number] | undefined {
  const range = xMsRangeHeaderValue || rangeHeaderValue;
  if (!range) {
    return undefined;
  }

  let parts = range.split("=");
  if (parts === undefined || parts.length !== 2) {
    throw new RangeError(
      `deserializeRangeHeader: raw range value ${range} is wrong.`
    );
  }

  parts = parts[1].split("-");
  if (parts === undefined || parts.length < 1 || parts.length > 2) {
    throw new RangeError(
      `deserializeRangeHeader: raw range value ${range} is wrong.`
    );
  }

  const startInclusive = parseInt(parts[0], 10);
  let endInclusive = Infinity;

  if (parts.length > 1 && parts[1] !== "") {
    endInclusive = parseInt(parts[1], 10);
  }

  if (startInclusive > endInclusive) {
    throw new RangeError(
      `deserializeRangeHeader: raw range value ${range} is wrong.`
    );
  }

  return [startInclusive, endInclusive];
}

/**
 * Deserialize range header into valid page ranges.
 * For example, "bytes=0-1023" will return [0, 1023].
 *
 * Default range value [0, Infinite] will be returned if all parameters not provided.
 *
 * @private
 * @param {string} [rangeHeaderValue]
 * @param {string} [xMsRangeHeaderValue]
 * @returns {([number, number] | undefined)}
 */
export function deserializePageBlobRangeHeader(
  rangeHeaderValue?: string,
  xMsRangeHeaderValue?: string,
  force512boundary = true
): [number, number] {
  const ranges = deserializeRangeHeader(rangeHeaderValue, xMsRangeHeaderValue);
  const startInclusive = ranges ? ranges[0] : 0;
  const endInclusive = ranges ? ranges[1] : Infinity;

  if (force512boundary && startInclusive % 512 !== 0) {
    throw new RangeError(
      `deserializePageBlobRangeHeader: range start value ${startInclusive} doesn't align with 512 boundary.`
    );
  }

  if (
    force512boundary &&
    endInclusive !== Infinity &&
    (endInclusive + 1) % 512 !== 0
  ) {
    throw new RangeError(
      `deserializePageBlobRangeHeader: range end value ${endInclusive} doesn't align with 512 boundary.`
    );
  }

  return [startInclusive, endInclusive];
}

/**
 * Remove double Quotation mark from ListBlob returned Etag, to align with server
 *
 * @param {string} [inputEtag]
 * @returns {string}
 */
export function removeQuotationFromListBlobEtag(inputEtag: string): string {
  if (inputEtag === undefined) {
    return inputEtag;
  }
  if (inputEtag[0] === '"' && inputEtag[inputEtag.length - 1] === '"') {
    return inputEtag.substring(1, inputEtag.length - 1);
  }
  return inputEtag;
}

export function validateContainerName(
  requestID: string,
  containerName: string
) {
  if (
    containerName !== "" &&
    (containerName!.length < 3 || containerName!.length > 63)
  ) {
    throw StorageErrorFactory.getOutOfRangeName(requestID);
  }
  const reg = new RegExp("^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$");
  if (!reg.test(containerName!)) {
    throw StorageErrorFactory.getInvalidResourceName(requestID);
  }
}

export function getUserDelegationKeyValue(
  signedObjectid: string,
  signedTenantid: string,
  signedStartsOn: string,
  signedExpiresOn: string,
  signedVersion: string,
): string {
  const stringToSign = [
    signedObjectid,
    signedTenantid,
    signedStartsOn,
    signedExpiresOn,
    "b",
    signedVersion
  ].join("\n");

  return createHmac("sha256", USERDELEGATIONKEY_SIGNING_SEED).update(stringToSign, "utf8").digest("base64");
}

export function getBlobTagsCount(
  blobTags: BlobTags | undefined
): number | undefined {
  return (blobTags === undefined || blobTags?.blobTagSet.length === 0) ? undefined : blobTags?.blobTagSet.length
}

export function getTagsFromString(blobTagsString: string, contextID: string): BlobTags | undefined {
  if (blobTagsString === '' || blobTagsString === undefined) {
    return undefined;
  }
  let blobTags: BlobTag[] = [];
  const rawTags = blobTagsString.split("&");
  rawTags.forEach((rawTag) => {
    const tagpair = rawTag.split("=");
    blobTags.push({
      // When the Blob tag is input with header, it's encoded, sometimes space will be encoded to "+" ("+" will be encoded to "%2B")
      // But in decodeURIComponent(), "+" won't be decode to space, so we need first replace "+" to "%20", then decode the tag.
      key: decodeURIComponent(tagpair[0].replace(/\+/g, '%20')),
      value: decodeURIComponent(tagpair[1].replace(/\+/g, '%20')),
    });
  })
  validateBlobTag(
    {
      blobTagSet: blobTags,
    },
    contextID
  );
  return {
    blobTagSet: blobTags,
  };
}

// validate as the limitation from https://learn.microsoft.com/en-us/rest/api/storageservices/set-blob-tags?tabs=azure-ad#request-body
export function validateBlobTag(tags: BlobTags, contextID: string): void {
  if (tags.blobTagSet.length > 10) {
    throw StorageErrorFactory.getTagsTooLarge(contextID);
  }
  tags.blobTagSet.forEach((tag) => {
    if (tag.key.length == 0) {
      throw StorageErrorFactory.getEmptyTagName(contextID);
    }
    if (tag.key.length > 128) {
      throw StorageErrorFactory.getTagsTooLarge(contextID);
    }
    if (tag.value.length > 256) {
      throw StorageErrorFactory.getTagsTooLarge(contextID);
    }
    if (ContainsInvalidTagCharacter(tag.key)) {
      throw StorageErrorFactory.getInvalidTag(contextID);
    }
    if (ContainsInvalidTagCharacter(tag.value)) {
      throw StorageErrorFactory.getInvalidTag(contextID);
    }
  });
}

function ContainsInvalidTagCharacter(s: string): boolean {
  for (let c of s) {
    if (!(c >= 'a' && c <= 'z' ||
      c >= 'A' && c <= 'Z' ||
      c >= '0' && c <= '9' ||
      c == ' ' ||
      c == '+' ||
      c == '-' ||
      c == '.' ||
      c == '/' ||
      c == ':' ||
      c == '=' ||
      c == '_')) {
      return true;
    }
  }
  return false;
}

export function toBlobTags(input: TagContent[]): BlobTag[] {
  const tags: Record<string, string> = {};
  input.forEach(element => {
    if (element.key !== '@container') {
      tags[element.key!] = element.value!;
    }
  });

  return Object.entries(tags).map(([key, value]) => {
    return {
      key: key,
      value: value
    }
  });
}

/**
 * Validate the `snapshot` and `versionId` query parameters of a blob request.
 *
 * A request may address a snapshot or a version, but not both. Azure Storage rejects
 * the combination with 400 InvalidQueryParameterValue.
 *
 * @export
 * @param {string} [snapshot]
 * @param {string} [versionId]
 * @param {string} [contextID]
 */
export function validateSnapshotAndVersionId(
  snapshot?: string,
  versionId?: string,
  contextID?: string
): void {
  // A version ID is an RFC 3339 timestamp with 7 digit fractional seconds. Azure rejects
  // anything else with 400 InvalidQueryParameterValue rather than returning 404.
  if (
    versionId !== undefined &&
    versionId !== "" &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(versionId)
  ) {
    throw StorageErrorFactory.getInvalidQueryParameterValue(
      contextID,
      "versionid",
      versionId,
      "The version ID is not a valid RFC 3339 timestamp with 7 digit fractional seconds."
    );
  }

  if (
    snapshot !== undefined &&
    snapshot !== "" &&
    versionId !== undefined &&
    versionId !== ""
  ) {
    throw StorageErrorFactory.getInvalidQueryParameterValue(
      contextID,
      "versionid",
      versionId,
      "The snapshot and versionid query parameters are mutually exclusive."
    );
  }
}
