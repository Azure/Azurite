import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlockBlobHandler from "../generated/handlers/IBlockBlobHandler";
import { parseXML } from "../generated/utils/xml";
import { BlobModel, BlockModel } from "../persistence/IBlobMetadataStore";
import { BLOB_API_VERSION } from "../utils/constants";
import { getMD5FromStream, getMD5FromString, newEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";

/**
 * BlobHandler handles Azure Storage BlockBlob related requests.
 *
 * @export
 * @class BlockBlobHandler
 * @extends {BaseHandler}
 * @implements {IBlockBlobHandler}
 */
export default class BlockBlobHandler extends BaseHandler
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
      metadata: options.metadata,
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
      persistency
    };

    if (options.tier !== undefined) {
      blob.properties.accessTier = this.parseTier(options.tier);
      if (blob.properties.accessTier === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
          HeaderName: "x-ms-access-tier",
          HeaderValue: `${options.tier}`
        });
      }
    }
    // TODO: Need a lock for multi keys including containerName and blobName
    // TODO: Provide a specified function.
    await this.metadataStore.createBlob(
      context,
      blob,
      options.leaseAccessConditions
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
    throw new NotImplementedError(context.contextId);
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
      options.blobHTTPHeaders.blobContentType ||
      context.request!.getHeader("content-type") ||
      "application/octet-stream";

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
    const parsed = await parseXML(rawBody, true);

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
      properties: {
        lastModified: new Date(),
        etag: newEtag()
      },
      isCommitted: true
    };

    blob.metadata = options.metadata;
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
    }

    await this.metadataStore.commitBlockList(
      context,
      blob,
      commitBlockList,
      options.leaseAccessConditions
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
      undefined,
      options.leaseAccessConditions
    );

    // TODO: Create uncommitted blockblob when stage block
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

    response.uncommittedBlocks = res.uncommittedBlocks;
    response.committedBlocks = res.committedBlocks;
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
}
