import { createHmac } from "crypto";
import { createWriteStream, PathLike } from "fs";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { USERDELEGATIONKEY_BASIC_KEY } from "./constants";
import { BlobTag, BlobTags } from "@azure/storage-blob";
import { TagContent } from "../persistence/QueryInterpreter/QueryNodes/IQueryNode";

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

  return createHmac("sha256", USERDELEGATIONKEY_BASIC_KEY).update(stringToSign, "utf8").digest("base64");
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
