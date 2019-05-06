import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlockBlobHandler from "../generated/handlers/IBlockBlobHandler";
import { parseXML } from "../generated/utils/xml";
import { BlobModel, BlockModel } from "../persistence/IBlobDataStore";
import { API_VERSION } from "../utils/constants";
import { getMD5FromStream, getMD5FromString, newEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";
import BlobHandler from "./BlobHandler";

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
    const contentMD5 =
      options.blobHTTPHeaders.blobContentMD5 ||
      context.request!.getHeader("content-md5");

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    const persistency = await this.dataStore.writePayload(body);

    // Calculate MD5 for validation
    const stream = await this.dataStore.readPayload(persistency);
    const calculatedContentMD5 = await getMD5FromStream(stream);
    if (contentMD5 !== undefined) {
      if (typeof contentMD5 === "string") {
        const calculatedContentMD5String = Buffer.from(
          calculatedContentMD5
        ).toString("base64");
        if (contentMD5 !== calculatedContentMD5String) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextID!,
            "Provided contentMD5 doesn't match."
          );
        }
      } else {
        if (
          contentMD5 !== undefined &&
          !Buffer.from(contentMD5).equals(calculatedContentMD5)
        ) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextID!,
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
        accessTierInferred: true
      },
      snapshot: "",
      isCommitted: true,
      persistency
    };

    // TODO: Need a lock for multi keys including containerName and blobName
    await this.dataStore.updateBlob(blob);

    const response: Models.BlockBlobUploadResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: date,
      contentMD5: blob.properties.contentMD5,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date,
      isServerEncrypted: true
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
    // TODO: Check Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    const persistency = await this.dataStore.writePayload(body);
    const block: BlockModel = {
      accountName,
      containerName,
      blobName,
      isCommitted: false,
      name: blockId,
      size: contentLength,
      persistency
    };

    await this.dataStore.updateBlock(block);

    // Create an uncommitted block blob if doesn't exist
    // TODO: Lock
    let blob = await this.dataStore.getBlob(
      accountName,
      containerName,
      blobName
    );
    if (!blob) {
      const etag = newEtag();
      blob = {
        deleted: false,
        accountName,
        containerName,
        name: blobName,
        properties: {
          creationTime: date,
          lastModified: date,
          etag,
          contentLength,
          blobType: Models.BlobType.BlockBlob
        },
        snapshot: "",
        isCommitted: false
      };
      await this.dataStore.updateBlob(blob!);
    }
    // TODO: Unlock

    const response: Models.BlockBlobStageBlockResponse = {
      statusCode: 201,
      contentMD5: undefined, // TODO: Block content MD5
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date,
      isServerEncrypted: true
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
    throw new NotImplementedError(context.contextID);
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

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    // TODO: Lock for container and blob
    let blob = await this.dataStore.getBlob(
      accountName,
      containerName,
      blobName
    );
    if (!blob) {
      // At least there should be a uncommitted blob
      // If not, there are some error happens
      // TODO: Which error should be thrown ere?
      // TODO: Unlock
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }

    // Check Lease status
    BlobHandler.checkBlobLeaseOnWriteBlob(
      context,
      blob,
      options.leaseAccessConditions
    );

    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentType =
      options.blobHTTPHeaders.blobContentType ||
      context.request!.getHeader("content-type") ||
      "application/octet-stream";

    // Get all blocks in persistency layer
    const pUncommittedBlocks = await this.dataStore.listBlocks(
      accountName,
      containerName,
      blobName,
      false
    );
    const pCommittedBlocksMap: Map<string, BlockModel> = new Map(); // persistencyCommittedBlocksMap
    for (const pBlock of blob.committedBlocksInOrder || []) {
      pCommittedBlocksMap.set(pBlock.name, {
        ...pBlock,
        accountName,
        containerName,
        blobName,
        isCommitted: true
      });
    }

    const pUncommittedBlocksMap: Map<string, BlockModel> = new Map(); // persistencyUncommittedBlocksMap
    for (const pBlock of pUncommittedBlocks) {
      if (!pBlock.isCommitted) {
        pUncommittedBlocksMap.set(pBlock.name, pBlock);
      }
    }

    // Here we leveraged generated code utils to parser xml
    // Re-parsing request body to get destination blocks
    // We don't leverage serialized blocks parameter because it doesn't include sequence
    const rawBody = request.getBody();
    const badRequestError = StorageErrorFactory.getInvalidOperation(
      blobCtx.contextID!
    );
    if (rawBody === undefined) {
      throw badRequestError;
    }
    const parsed = await parseXML(rawBody, true);

    // Validate selected block list
    const selectedBlockList: BlockModel[] = [];

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

        switch (blockCommitType.toLowerCase()) {
          case "uncommitted":
            const pUncommittedBlock = pUncommittedBlocksMap.get(blockID);
            if (pUncommittedBlock === undefined) {
              throw badRequestError;
            } else {
              pUncommittedBlock.isCommitted = true;
              selectedBlockList.push(pUncommittedBlock);
            }
            break;
          case "committed":
            const pCommittedBlock = pCommittedBlocksMap.get(blockID);
            if (pCommittedBlock === undefined) {
              throw badRequestError;
            } else {
              selectedBlockList.push(pCommittedBlock);
            }
            break;
          case "latest":
            const pLatestBlock =
              pUncommittedBlocksMap.get(blockID) ||
              pCommittedBlocksMap.get(blockID);
            if (pLatestBlock === undefined) {
              throw badRequestError;
            } else {
              pLatestBlock.isCommitted = true;
              selectedBlockList.push(pLatestBlock);
            }
            break;
          default:
            throw badRequestError;
        }
      }
    }

    // Commit block list
    blob.committedBlocksInOrder = selectedBlockList;
    blob.isCommitted = true;

    blob.metadata = options.metadata;
    blob.properties.accessTier = Models.AccessTier.Hot;
    blob.properties.accessTierInferred = true;
    blob.properties.cacheControl = options.blobHTTPHeaders.blobCacheControl;
    blob.properties.contentType = contentType;
    blob.properties.contentMD5 = options.blobHTTPHeaders.blobContentMD5;
    blob.properties.contentEncoding =
      options.blobHTTPHeaders.blobContentEncoding;
    blob.properties.contentLanguage =
      options.blobHTTPHeaders.blobContentLanguage;
    blob.properties.contentDisposition =
      options.blobHTTPHeaders.blobContentDisposition;
    blob.properties.contentLength = selectedBlockList
      .map(block => block.size)
      .reduce((total, val) => {
        return total + val;
      });

    // set lease state to available if it's expired
    blob = BlobHandler.UpdateBlobLeaseStateOnWriteBlob(blob);
    await this.dataStore.updateBlob(blob);

    // TODO: recover deleted blocks when inserts failed
    await this.dataStore.deleteBlocks(accountName, containerName, blobName);

    // TODO: Unlock

    const contentMD5 = await getMD5FromString(rawBody);

    const response: Models.BlockBlobCommitBlockListResponse = {
      statusCode: 201,
      eTag: newEtag(),
      lastModified: blobCtx.startTime,
      contentMD5,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date: blobCtx.startTime,
      isServerEncrypted: true
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

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    const blob = await this.dataStore.getBlob(
      accountName,
      containerName,
      blobName
    );
    if (!blob) {
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }

    const blockList = await this.dataStore.listBlocks(
      accountName,
      containerName,
      blobName,
      false
    );
    const response: Models.BlockBlobGetBlockListResponse = {
      statusCode: 200,
      lastModified: blob.properties.lastModified,
      eTag: blob.properties.etag,
      contentType: blob.properties.contentType,
      blobContentLength: blob.properties.contentLength,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date,
      committedBlocks: [],
      uncommittedBlocks: []
    };

    response.uncommittedBlocks = blockList;
    response.committedBlocks = blob.committedBlocksInOrder;

    return response;
  }
}
