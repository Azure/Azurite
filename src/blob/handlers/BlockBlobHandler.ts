import { URLBuilder } from "@azure/ms-rest-js";
import axios, { AxiosResponse } from "axios";

import { convertRawHeadersToMetadata } from "../../common/utils/utils";
import {
  getMD5FromStream,
  getMD5FromString,
  newEtag
} from "../../common/utils/utils";
import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlockBlobHandler from "../generated/handlers/IBlockBlobHandler";
import { parseXML } from "../generated/utils/xml";
import { extractStoragePartsFromPath } from "../middlewares/blobStorageContext.middleware";
import { BlobModel, BlockModel } from "../persistence/IBlobMetadataStore";
import { BLOB_API_VERSION, HeaderConstants } from "../utils/constants";
import BaseHandler from "./BaseHandler";
import {
  getTagsFromString,
  deserializeRangeHeader,
  getBlobTagsCount,
} from "../utils/utils";

/**
 * BlobHandler handles Azure Storage BlockBlob related requests.
 *
 * @export
 * @class BlockBlobHandler
 * @extends {BaseHandler}
 * @implements {IBlockBlobHandler}
 */
export default class BlockBlobHandler
  extends BaseHandler
  implements IBlockBlobHandler {
  public async upload(
    body: NodeJS.ReadableStream,
    contentLength: number,
    options: Models.BlockBlobUploadOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobUploadResponse> {
    // TODO: Check Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = context.startTime!;
    const etag = newEtag();
    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentType =
      options.blobHTTPHeaders.blobContentType ||
      context.request!.getHeader("content-type") ||
      "application/octet-stream";
    const contentMD5 = context.request!.getHeader("content-md5")
      ? options.blobHTTPHeaders.blobContentMD5 ||
        context.request!.getHeader("content-md5")
      : undefined;

    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const persistency = await this.extentStore.appendExtent(
      body,
      context.contextId
    );
    if (persistency.count !== contentLength) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextId!,
        `The size of the request body ${persistency.count} mismatches the content-length ${contentLength}.`
      );
    }

    // Calculate MD5 for validation
    const stream = await this.extentStore.readExtent(
      persistency,
      context.contextId
    );
    const calculatedContentMD5 = await getMD5FromStream(stream);
    if (contentMD5 !== undefined) {
      if (typeof contentMD5 === "string") {
        const calculatedContentMD5String = Buffer.from(
          calculatedContentMD5
        ).toString("base64");
        if (contentMD5 !== calculatedContentMD5String) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextId!,
            "Provided contentMD5 doesn't match."
          );
        }
      } else {
        if (!Buffer.from(contentMD5).equals(calculatedContentMD5)) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextId!,
            "Provided contentMD5 doesn't match."
          );
        }
      }
    }

    const blob: BlobModel = {
      deleted: false,
      // Preserve metadata key case
      metadata: convertRawHeadersToMetadata(blobCtx.request!.getRawHeaders()),
      accountName,
      containerName,
      name: blobName,
      properties: {
        creationTime: date,
        lastModified: date,
        etag,
        contentLength,
        contentType,
        contentEncoding: options.blobHTTPHeaders.blobContentEncoding,
        contentLanguage: options.blobHTTPHeaders.blobContentLanguage,
        contentMD5: calculatedContentMD5,
        contentDisposition: options.blobHTTPHeaders.blobContentDisposition,
        cacheControl: options.blobHTTPHeaders.blobCacheControl,
        blobType: Models.BlobType.BlockBlob,
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        serverEncrypted: true,
        accessTier: Models.AccessTier.Hot,
        accessTierInferred: true,
        accessTierChangeTime: date
      },
      snapshot: "",
      isCommitted: true,
      persistency,
      blobTags: options.blobTagsString === undefined ? undefined : getTagsFromString(options.blobTagsString, context.contextId!),
    };

    if (options.tier !== undefined) {
      blob.properties.accessTier = this.parseTier(options.tier);
      if (blob.properties.accessTier === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
          HeaderName: "x-ms-access-tier",
          HeaderValue: `${options.tier}`
        });
      }
      blob.properties.accessTierInferred = false;
    }
    // TODO: Need a lock for multi keys including containerName and blobName
    // TODO: Provide a specified function.
    await this.metadataStore.createBlob(
      context,
      blob,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.BlockBlobUploadResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: date,
      contentMD5: blob.properties.contentMD5,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };

    return response;
  }

  public async putBlobFromUrl(contentLength: number, copySource: string, options: Models.BlockBlobPutBlobFromUrlOptionalParams, context: Context
    ): Promise<Models.BlockBlobPutBlobFromUrlResponse> {
    throw new NotImplementedError(context.contextId);
    }

  public async stageBlock(
    blockId: string,
    contentLength: number,
    body: NodeJS.ReadableStream,
    options: Models.BlockBlobStageBlockOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobStageBlockResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    // stageBlock operation doesn't have blobHTTPHeaders
    // https://learn.microsoft.com/en-us/rest/api/storageservices/put-block
    // options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentMD5 = context.request!.getHeader("content-md5")
      ? options.transactionalContentMD5 ||
        context.request!.getHeader("content-md5")
      : undefined;

    this.validateBlockId(blockId, blobCtx);

    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const persistency = await this.extentStore.appendExtent(
      body,
      context.contextId
    );
    if (persistency.count !== contentLength) {
      // TODO: Confirm error code
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextId!,
        `The size of the request body ${persistency.count} mismatches the content-length ${contentLength}.`
      );
    }

    // Calculate MD5 for validation
    const stream = await this.extentStore.readExtent(
      persistency,
      context.contextId
    );
    const calculatedContentMD5 = await getMD5FromStream(stream);
    if (contentMD5 !== undefined) {
      if (typeof contentMD5 === "string") {
        const calculatedContentMD5String = Buffer.from(
          calculatedContentMD5
        ).toString("base64");
        if (contentMD5 !== calculatedContentMD5String) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextId!,
            "Provided contentMD5 doesn't match."
          );
        }
      } else {
        if (!Buffer.from(contentMD5).equals(calculatedContentMD5)) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextId!,
            "Provided contentMD5 doesn't match."
          );
        }
      }
    }

    const block: BlockModel = {
      accountName,
      containerName,
      blobName,
      isCommitted: false,
      name: blockId,
      size: contentLength,
      persistency
    };

    // TODO: Verify it.
    await this.metadataStore.stageBlock(
      context,
      block,
      options.leaseAccessConditions
    );

    const response: Models.BlockBlobStageBlockResponse = {
      statusCode: 201,
      contentMD5: undefined, // TODO: Block content MD5
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };

    return response;
  }

  public async stageBlockFromURL(
    blockId: string,
    contentLength: number,
    sourceUrl: string,
    options: Models.BlockBlobStageBlockFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobStageBlockFromURLResponse> {

    const blobCtx = new BlobStorageContext(context);

    // TODO: Check dest Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const url = this.NewUriFromCopySource(sourceUrl, context);
    const [
      sourceAccount,
      sourceContainer,
      sourceBlob
    ] = extractStoragePartsFromPath(url.hostname, url.pathname, blobCtx.disableProductStyleUrl);
    const snapshot = url.searchParams.get("snapshot") || "";

    if (
      sourceAccount === undefined ||
      sourceContainer === undefined ||
      sourceBlob === undefined
    ) {
      throw StorageErrorFactory.getBlobNotFound(context.contextId!);
    }

    const sig = url.searchParams.get("sig");
    if ((sourceAccount !== blobCtx.account) || (sig !== null)) {
      await this.validateCopySource(sourceUrl, sourceAccount, context);
    }

    const downloadBlobRes = await this.metadataStore.downloadBlob(
      context,
      sourceAccount,
      sourceContainer,
      sourceBlob,
      snapshot,
      options.leaseAccessConditions,
    );

    if (downloadBlobRes.properties.contentLength === undefined) {
      throw StorageErrorFactory.getConditionNotMet(context.contextId!);
    }

    const downloadBlockBlobRes = await this.downloadBlockBlobOrAppendBlob(
      { snapshot: snapshot, leaseAccessConditions: options.leaseAccessConditions },
      context,
      downloadBlobRes,
    );

    if (downloadBlockBlobRes.body === undefined) {
      throw StorageErrorFactory.getConditionNotMet(context.contextId!);
    }

    const stageBlockRes = await this.stageBlock(blockId,
      downloadBlobRes.properties.contentLength,
      downloadBlockBlobRes.body,
      { leaseAccessConditions: options.leaseAccessConditions },
      context
    );

    const response: Models.BlockBlobStageBlockFromURLResponse = {
      statusCode: stageBlockRes.statusCode,
      contentMD5: stageBlockRes.contentMD5,
      date: stageBlockRes.date,
      encryptionKeySha256: stageBlockRes.encryptionKeySha256,
      encryptionScope: stageBlockRes.encryptionScope,
      errorCode: stageBlockRes.errorCode,
      isServerEncrypted: stageBlockRes.isServerEncrypted,
      requestId: stageBlockRes.requestId,
      version: stageBlockRes.version,
      xMsContentCrc64: stageBlockRes.xMsContentCrc64,
    };

    return response
  }

  public async commitBlockList(
    blocks: Models.BlockLookupList,
    options: Models.BlockBlobCommitBlockListOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobCommitBlockListResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const request = blobCtx.request!;

    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentType =
      options.blobHTTPHeaders.blobContentType || "application/octet-stream";

    // Here we leveraged generated code utils to parser xml
    // Re-parsing request body to get destination blocks
    // We don't leverage serialized blocks parameter because it doesn't include sequence
    const rawBody = request.getBody();
    const badRequestError = StorageErrorFactory.getInvalidOperation(
      blobCtx.contextId!
    );
    if (rawBody === undefined) {
      throw badRequestError;
    }

    let parsed;
    try {
      parsed = await parseXML(rawBody, true);
    } catch (err) {
      // return the 400(InvalidXmlDocument) error for issue 1955
      throw StorageErrorFactory.getInvalidXmlDocument(context.contextId);
    }

    // Validate selected block list
    const commitBlockList = [];

    // $$ is the built-in field of xml2js parsing results when enabling explicitChildrenWithOrder
    // TODO: Should make these fields explicit for parseXML method
    // TODO: What happens when committedBlocks and uncommittedBlocks contains same block ID?
    if (parsed !== undefined && parsed.$$ instanceof Array) {
      for (const block of parsed.$$) {
        const blockID: string | undefined = block._;
        const blockCommitType: string | undefined = block["#name"];

        if (blockID === undefined || blockCommitType === undefined) {
          throw badRequestError;
        }
        commitBlockList.push({
          blockName: blockID,
          blockCommitType
        });
      }
    }

    const blob: BlobModel = {
      accountName,
      containerName,
      name: blobName,
      snapshot: "",      
      blobTags: options.blobTagsString === undefined ? undefined : getTagsFromString(options.blobTagsString, context.contextId!),
      properties: {
        lastModified: context.startTime!,
        creationTime: context.startTime!,
        etag: newEtag()
      },
      isCommitted: true
    };

    blob.properties.blobType = Models.BlobType.BlockBlob;
    blob.metadata = convertRawHeadersToMetadata(
      // Preserve metadata key case
      blobCtx.request!.getRawHeaders()
    );
    blob.properties.accessTier = Models.AccessTier.Hot;
    blob.properties.cacheControl = options.blobHTTPHeaders.blobCacheControl;
    blob.properties.contentType = contentType;
    blob.properties.contentMD5 = options.blobHTTPHeaders.blobContentMD5;
    blob.properties.contentEncoding =
      options.blobHTTPHeaders.blobContentEncoding;
    blob.properties.contentLanguage =
      options.blobHTTPHeaders.blobContentLanguage;
    blob.properties.contentDisposition =
      options.blobHTTPHeaders.blobContentDisposition;

    if (options.tier !== undefined) {
      blob.properties.accessTier = this.parseTier(options.tier);
      if (blob.properties.accessTier === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
          HeaderName: "x-ms-access-tier",
          HeaderValue: `${options.tier}`
        });
      }
    } else {
      blob.properties.accessTier = Models.AccessTier.Hot;
      blob.properties.accessTierInferred = true;
    }

    await this.metadataStore.commitBlockList(
      context,
      blob,
      commitBlockList,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const contentMD5 = await getMD5FromString(rawBody);

    const response: Models.BlockBlobCommitBlockListResponse = {
      statusCode: 201,
      eTag: blob.properties.etag,
      lastModified: blobCtx.startTime,
      contentMD5,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date: blobCtx.startTime,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };
    return response;
  }

  public async getBlockList(
    options: Models.BlockBlobGetBlockListOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobGetBlockListResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    const res = await this.metadataStore.getBlockList(
      context,
      accountName,
      containerName,
      blobName,
      options.snapshot,
      undefined,
      options.leaseAccessConditions
    );

    // TODO: Create uncommitted blockblob when stage block
    // TODO: Conditional headers support?

    res.properties = res.properties || {};
    const response: Models.BlockBlobGetBlockListResponse = {
      statusCode: 200,
      lastModified: res.properties.lastModified,
      eTag: res.properties.etag,
      contentType: res.properties.contentType,
      blobContentLength: res.properties.contentLength,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date,
      committedBlocks: [],
      uncommittedBlocks: []
    };

    if (
      options.listType !== undefined &&
      (options.listType.toLowerCase() ===
        Models.BlockListType.All.toLowerCase() ||
        options.listType.toLowerCase() ===
          Models.BlockListType.Uncommitted.toLowerCase())
    ) {
      response.uncommittedBlocks = res.uncommittedBlocks;
    }
    if (
      options.listType === undefined ||
      options.listType.toLowerCase() ===
        Models.BlockListType.All.toLowerCase() ||
      options.listType.toLowerCase() ===
        Models.BlockListType.Committed.toLowerCase()
    ) {
      response.committedBlocks = res.committedBlocks;
    }
    response.clientRequestId = options.requestId;

    return response;
  }

  /**
   * Get the tier setting from request headers.
   *
   * @private
   * @param {string} tier
   * @returns {(Models.AccessTier | undefined)}
   * @memberof BlobHandler
   */
  private parseTier(tier: string): Models.AccessTier | undefined {
    tier = tier.toLowerCase();
    if (tier === Models.AccessTier.Hot.toLowerCase()) {
      return Models.AccessTier.Hot;
    }
    if (tier === Models.AccessTier.Cool.toLowerCase()) {
      return Models.AccessTier.Cool;
    }
    if (tier === Models.AccessTier.Archive.toLowerCase()) {
      return Models.AccessTier.Archive;
    }
    if (tier === Models.AccessTier.Cold.toLowerCase()) {
      return Models.AccessTier.Cold;
    }
    return undefined;
  }

  private validateBlockId(blockId: string, context: Context): void {
    const rawBlockId = Buffer.from(blockId, "base64");

    if (blockId !== rawBlockId.toString("base64")) {
      throw StorageErrorFactory.getInvalidQueryParameterValue(
        context.contextId,
        "blockid",
        blockId,
        "Not a valid base64 string."
      );
    }

    if (rawBlockId.length > 64) {
      throw StorageErrorFactory.getOutOfRangeInput(
        context.contextId!,
        "blockid",
        blockId,
        "Block ID length cannot exceed 64."
      );
    }
  }

  // from BlobHandler, surely there must be a better way

  private async validateCopySource(copySource: string, sourceAccount: string, context: Context): Promise<void> {
    // Currently the only cross-account copy support is from/to the same Azurite instance. In either case access
    // is determined by performing a request to the copy source to see if the authentication is valid.
    const blobCtx = new BlobStorageContext(context);

    const currentServer = blobCtx.request!.getHeader("Host") || "";
    const url = this.NewUriFromCopySource(copySource, context);
    if (currentServer !== url.host) {
      this.logger.error(
        `BlobHandler:startCopyFromURL() Source account ${url} is not on the same Azurite instance as target account ${blobCtx.account}`,
        context.contextId
      );

      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
        404,
        "The specified resource does not exist"
      );
    }

    this.logger.debug(
      `BlobHandler:startCopyFromURL() Validating access to the source account ${sourceAccount}`,
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
      this.logger.debug(
        `BlobHandler:startCopyFromURL() Successfully validated access to source account ${sourceAccount}`,
        context.contextId
      );
    } else {
      this.logger.debug(
        `BlobHandler:startCopyFromURL() Access denied to source account ${sourceAccount} StatusCode=${validationResponse.status}, AuthenticationErrorDetail=${validationResponse.data}`,
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

  private NewUriFromCopySource(copySource: string, context: Context): URL {
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
   * @private
   * @param {Models.BlobDownloadOptionalParams} options
   * @param {Context} context
   * @param {BlobModel} blob
   * @returns {Promise<Models.BlobDownloadResponse>}
   * @memberof BlobHandler
   */
  private async downloadBlockBlobOrAppendBlob(
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

    this.logger.info(
      // tslint:disable-next-line:max-line-length
      `BlobHandler:downloadBlockBlobOrAppendBlob() NormalizedDownloadRange=bytes=${rangeStart}-${rangeEnd} RequiredContentLength=${contentLength}`,
      context.contextId
    );

    let bodyGetter: () => Promise<NodeJS.ReadableStream | undefined>;
    const blocks = blob.committedBlocksInOrder;
    if (blocks === undefined || blocks.length === 0) {
      bodyGetter = async () => {
        if (blob.persistency === undefined) {
          return this.extentStore.readExtent(undefined, context.contextId);
        }
        return this.extentStore.readExtent(
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
        return this.extentStore.readExtents(
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
}
