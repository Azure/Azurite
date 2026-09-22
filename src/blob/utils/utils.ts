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

function decodeChecksumHeader(
  value: Uint8Array | string
): Buffer | undefined {
  return typeof value === "string"
    ? decodeBase64HeaderValue(value)
    : Buffer.from(value);
}

/**
 * Decodes an MD5 header value (base64 string or raw Uint8Array) and returns
 * whether the result is exactly 16 bytes - the only shape real Azure accepts.
 * Wrong-length values on Content-MD5, transactionalContentMD5, or
 * x-ms-blob-content-md5 are all rejected with InvalidMd5 (verified live).
 */
export function isValidMd5Header(value: Uint8Array | string): boolean {
  const bytes = decodeChecksumHeader(value);
  return bytes !== undefined && bytes.length === 16;
}

/**
 * Checks the shape of the checksum headers a request carries and picks the
 * pair its bytes are compared with, before anything is read. Every MD5
 * candidate that is present must be well formed, and the first one present
 * is the one compared, so callers list them in precedence order. An MD5 and
 * a CRC64 cannot be sent together. A malformed CRC64 is reported under
 * `crc64HeaderName`, since Put Block From URL carries it as
 * x-ms-source-content-crc64 rather than x-ms-content-crc64.
 *
 * Verified against real Azure for CRC64: fewer than 8 bytes is rejected as
 * InvalidHeaderValue; 8 or more bytes pass this check and surface as
 * Crc64Mismatch if they do not match.
 */
export function validateTransactionalChecksumHeaders(
  md5Candidates: Array<Uint8Array | string | undefined>,
  crc64: Uint8Array | string | undefined,
  contextId: string | undefined,
  crc64HeaderName: string = HeaderConstants.X_MS_CONTENT_CRC64
): { md5?: Uint8Array | string; crc64?: Uint8Array | string } {
  const md5 = md5Candidates.find((candidate) => candidate !== undefined);
  if (md5 !== undefined && crc64 !== undefined) {
    throw StorageErrorFactory.getBothCrc64AndMd5HeaderPresent(contextId);
  }
  for (const candidate of md5Candidates) {
    if (candidate !== undefined && !isValidMd5Header(candidate)) {
      throw StorageErrorFactory.getInvalidMd5(contextId);
    }
  }
  if (crc64 !== undefined) {
    const bytes = decodeChecksumHeader(crc64);
    if (bytes === undefined || bytes.length < 8) {
      throw StorageErrorFactory.getInvalidHeaderValue(contextId, {
        HeaderName: crc64HeaderName,
        HeaderValue:
          typeof crc64 === "string"
            ? crc64
            : Buffer.from(crc64).toString("base64")
      });
    }
  }
  return { md5, crc64 };
}

/**
 * Computes MD5 and/or CRC-64/NVME from a stream in a single pass and validates
 * against the request-supplied values. Throws Md5Mismatch / Crc64Mismatch
 * (HTTP 400) on mismatch - the documented Azure Storage error codes for
 * transactional integrity failures.
 *
 * The header shapes are checked by validateTransactionalChecksumHeaders
 * first, so a request that supplies both checksums or a malformed one is
 * rejected before the stream is read.
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
  validateTransactionalChecksumHeaders(
    [expected.md5],
    expected.crc64,
    contextId
  );
  const calculated = await computeTransactionalChecksums(
    stream,
    expected,
    force
  );

  if (expected.md5 !== undefined) {
    const expectedMd5 = decodeChecksumHeader(expected.md5)!.toString("base64");
    const calculatedMd5 = Buffer.from(calculated.md5!).toString("base64");
    if (expectedMd5 !== calculatedMd5) {
      throw StorageErrorFactory.getMd5Mismatch(
        contextId,
        expectedMd5,
        calculatedMd5
      );
    }
  }
  if (expected.crc64 !== undefined) {
    const expectedCrc64 = decodeChecksumHeader(expected.crc64)!.toString(
      "base64"
    );
    const calculatedCrc64 = Buffer.from(calculated.crc64!).toString("base64");
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
