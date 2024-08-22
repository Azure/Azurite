import axios, { AxiosResponse } from 'axios';
import { createHmac } from 'crypto';
import { createWriteStream, PathLike } from 'fs';

import { URLBuilder } from '@azure/ms-rest-js';
import { BlobTag, BlobTags } from '@azure/storage-blob';

import IExtentStore from '../../common/persistence/IExtentStore';
import { getMD5FromStream } from '../../common/utils/utils';
import BlobStorageContext from '../context/BlobStorageContext';
import StorageErrorFactory from '../errors/StorageErrorFactory';
import * as Models from '../generated/artifacts/models';
import Context from '../generated/Context';
import ILogger from '../generated/utils/ILogger';
import { parseXML } from '../generated/utils/xml';
import { BlobModel } from '../persistence/IBlobMetadataStore';
import { BLOB_API_VERSION, HeaderConstants, USERDELEGATIONKEY_BASIC_KEY } from './constants';

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
): [number, number] {
  const range = xMsRangeHeaderValue || rangeHeaderValue;
  if (!range) {
    return [0, Infinity];
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
  const startInclusive = ranges[0];
  const endInclusive = ranges[1];

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
) : string {
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
) : number | undefined {
  return (blobTags === undefined || blobTags?.blobTagSet.length === 0) ? undefined : blobTags?.blobTagSet.length
}

export function getTagsFromString(blobTagsString: string, contextID: string): BlobTags | undefined {
  if (blobTagsString === '' || blobTagsString === undefined)
  {
    return undefined;
  }
  let blobTags:BlobTag[] = [];
  const rawTags = blobTagsString.split("&");
  rawTags.forEach((rawTag)=>{
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
      blobTagSet:blobTags,
    },
    contextID
  );
  return {
    blobTagSet:blobTags,
  };
}

// validate as the limitation from https://learn.microsoft.com/en-us/rest/api/storageservices/set-blob-tags?tabs=azure-ad#request-body
export function validateBlobTag(tags: BlobTags, contextID: string): void {
  if (tags.blobTagSet.length > 10){
    throw StorageErrorFactory.getTagsTooLarge(contextID);
  }
  tags.blobTagSet.forEach((tag)=>{
    if (tag.key.length == 0){
      throw StorageErrorFactory.getEmptyTagName(contextID);
    }
    if (tag.key.length > 128){
      throw StorageErrorFactory.getTagsTooLarge(contextID);
    }
    if (tag.value.length > 256){
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

function ContainsInvalidTagCharacter(s: string): boolean{
  for (let c of s)
  {
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
          c == '_'))
    {
        return true;
    }
  }
    return false;
}

export async function validateCopySource(
  logger: ILogger,
  loggerPrefix: string,
  copySource: string,
  sourceAccount: string,
  context: Context): Promise<void> {
  // Currently the only cross-account copy support is from/to the same Azurite instance. In either case access
  // is determined by performing a request to the copy source to see if the authentication is valid.
  const blobCtx = new BlobStorageContext(context);

  const currentServer = blobCtx.request!.getHeader("Host") || "";
  const url = NewUriFromCopySource(copySource, context);
  if (currentServer !== url.host) {
    logger.error(
      `${loggerPrefix}:startCopyFromURL() Source account ${url} is not on the same Azurite instance as target account ${blobCtx.account}`,
      context.contextId
    );

    throw StorageErrorFactory.getCannotVerifyCopySource(
      context.contextId!,
      404,
      "The specified resource does not exist"
    );
  }

  logger.debug(
    `${loggerPrefix}:startCopyFromURL() Validating access to the source account ${sourceAccount}`,
    context.contextId
  );

  // In order to retrieve proper error details we make a metadata request to the copy source. If we instead issue
  // a HEAD request then the error details are not returned and reporting authentication failures to the caller
  // becomes a black box.
  const metadataUrl = URLBuilder.parse(copySource);
  metadataUrl.setQueryParameter("comp", "metadata");
  const validationResponse: AxiosResponse = await axios.get(
    metadataUrl.toString(),
    {
      // Instructs axios to not throw an error for non-2xx responses
      validateStatus: () => true
    }
  );
  if (validationResponse.status === 200) {
    logger.debug(
      `${loggerPrefix}:startCopyFromURL() Successfully validated access to source account ${sourceAccount}`,
      context.contextId
    );
  } else {
    logger.debug(
      `${loggerPrefix}:startCopyFromURL() Access denied to source account ${sourceAccount} StatusCode=${validationResponse.status}, AuthenticationErrorDetail=${validationResponse.data}`,
      context.contextId
    );

    if (validationResponse.status === 404) {
      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        validationResponse.status,
        "The specified resource does not exist"
      );
    } else {
      // For non-successful responses attempt to unwrap the error message from the metadata call.
      let message: string =
        "Could not verify the copy source within the specified time.";
      if (
        validationResponse.headers[HeaderConstants.CONTENT_TYPE] ===
        "application/xml"
      ) {
        const authenticationError = await parseXML(validationResponse.data);
        if (authenticationError.Message !== undefined) {
          message = authenticationError.Message.replace(/\n+/gm, "");
        }
      }

      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        validationResponse.status,
        message
      );
    }
  }
}

export function NewUriFromCopySource(copySource: string, context: Context): URL {
  try {
    return new URL(copySource)
  }
  catch
  {
    throw StorageErrorFactory.getInvalidHeaderValue(
      context.contextId,
      {
        HeaderName: "x-ms-copy-source",
        HeaderValue: copySource
      })
  }
}

/**
   * Download block blob or append blob.
   *
   * @param {ILogger} logger
   * @param {string} loggerPrefix
   * @param {IExtentStore} extentStore
   * @param {Context} context
   * @param {BlobModel} blob
   * @returns {Promise<Models.BlobDownloadResponse>}
   */
export async function downloadBlockBlobOrAppendBlob(
  logger: ILogger,
  loggerPrefix: string,
  extentStore: IExtentStore,
  options: Models.BlobDownloadOptionalParams,
  context: Context,
  blob: BlobModel
): Promise<Models.BlobDownloadResponse> {
  if (blob.isCommitted === false) {
    throw StorageErrorFactory.getBlobNotFound(context.contextId!);
  }

  // Deserializer doesn't handle range header currently, manually parse range headers here
  const rangesParts = deserializeRangeHeader(
    context.request!.getHeader("range"),
    context.request!.getHeader("x-ms-range")
  );
  const rangeStart = rangesParts[0];
  let rangeEnd = rangesParts[1];

  // Start Range is bigger than blob length
  if (rangeStart > blob.properties.contentLength!) {
    throw StorageErrorFactory.getInvalidPageRange(context.contextId!);
  }

  // Will automatically shift request with longer data end than blob size to blob size
  if (rangeEnd + 1 >= blob.properties.contentLength!) {
    // report error is blob size is 0, and rangeEnd is specified but not 0 
    if (blob.properties.contentLength == 0 && rangeEnd !== 0 && rangeEnd !== Infinity) {
      throw StorageErrorFactory.getInvalidPageRange2(context.contextId!);
    }
    else {
      rangeEnd = blob.properties.contentLength! - 1;
    }
  }

  const contentLength = rangeEnd - rangeStart + 1;
  const partialRead = contentLength !== blob.properties.contentLength!;

  logger.info(
    // tslint:disable-next-line:max-line-length
    `${loggerPrefix}:downloadBlockBlobOrAppendBlob() NormalizedDownloadRange=bytes=${rangeStart}-${rangeEnd} RequiredContentLength=${contentLength}`,
    context.contextId
  );

  let bodyGetter: () => Promise<NodeJS.ReadableStream | undefined>;
  const blocks = blob.committedBlocksInOrder;
  if (blocks === undefined || blocks.length === 0) {
    bodyGetter = async () => {
      if (blob.persistency === undefined) {
        return extentStore.readExtent(undefined, context.contextId);
      }
      return extentStore.readExtent(
        {
          id: blob.persistency.id,
          offset: blob.persistency.offset + rangeStart,
          count: Math.min(blob.persistency.count, contentLength)
        },
        context.contextId
      );
    };
  } else {
    bodyGetter = async () => {
      return extentStore.readExtents(
        blocks.map((block) => block.persistency),
        rangeStart,
        rangeEnd + 1 - rangeStart,
        context.contextId
      );
    };
  }

  let contentRange: string | undefined;
  if (
    context.request!.getHeader("range") ||
    context.request!.getHeader("x-ms-range")
  ) {
    contentRange = `bytes ${rangeStart}-${rangeEnd}/${blob.properties
      .contentLength!}`;
  }

  let body: NodeJS.ReadableStream | undefined = await bodyGetter();
  let contentMD5: Uint8Array | undefined;
  if (!partialRead) {
    contentMD5 = blob.properties.contentMD5;
  }
  if (
    contentLength <= 4 * 1024 * 1024 &&
    contentMD5 === undefined &&
    body !== undefined
  ) {
    contentMD5 = await getMD5FromStream(body);
    body = await bodyGetter();
  }

  const response: Models.BlobDownloadResponse = {
    statusCode: contentRange ? 206 : 200,
    body,
    metadata: blob.metadata,
    eTag: blob.properties.etag,
    requestId: context.contextId,
    date: context.startTime!,
    version: BLOB_API_VERSION,
    ...blob.properties,
    cacheControl: context.request!.getQuery("rscc") ?? blob.properties.cacheControl,
    contentDisposition: context.request!.getQuery("rscd") ?? blob.properties.contentDisposition,
    contentEncoding: context.request!.getQuery("rsce") ?? blob.properties.contentEncoding,
    contentLanguage: context.request!.getQuery("rscl") ?? blob.properties.contentLanguage,
    contentType: context.request!.getQuery("rsct") ?? blob.properties.contentType,
    blobContentMD5: blob.properties.contentMD5,
    acceptRanges: "bytes",
    contentLength,
    contentRange,
    contentMD5: contentRange ? (context.request!.getHeader("x-ms-range-get-content-md5") ? contentMD5: undefined) : contentMD5,
    tagCount: getBlobTagsCount(blob.blobTags),
    isServerEncrypted: true,
    clientRequestId: options.requestId,
    creationTime: blob.properties.creationTime,
    blobCommittedBlockCount:
      blob.properties.blobType === Models.BlobType.AppendBlob
        ? (blob.committedBlocksInOrder || []).length
        : undefined,
  };

  return response;
}
