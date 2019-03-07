import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlockBlobHandler from "../generated/handlers/IBlockBlobHandler";
import { BlobModel, BlockModel } from "../persistence/IBlobDataStore";
import { API_VERSION } from "../utils/constants";
import { newEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";

export default class BlockBlobHandler extends BaseHandler
  implements IBlockBlobHandler {
  public async upload(
    body: NodeJS.ReadableStream,
    contentLength: number,
    options: Models.BlockBlobUploadOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobUploadResponse> {
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;

    const container = await this.dataStore.getContainer(containerName);
    if (!container) {
      throw StorageErrorFactory.getContainerNotFoundError(blobCtx.contextID!);
    }

    const persistencyID = await this.dataStore.writePayload(body);

    const existingBlob = await this.dataStore.getBlob(containerName, blobName);

    // TODO: Implement a high efficiency current date factory, because object allocation
    // and system call to get time is expensive
    const date = new Date();
    const etag = newEtag();
    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const blob: BlobModel = {
      deleted: false,
      metadata: options.metadata,
      name: blobName,
      properties: {
        creationTime: date,
        lastModified: date,
        etag,
        contentLength,
        contentType: options.blobHTTPHeaders.blobContentType,
        contentEncoding: options.blobHTTPHeaders.blobContentEncoding,
        contentLanguage: options.blobHTTPHeaders.blobContentLanguage,
        contentMD5: options.blobHTTPHeaders.blobContentMD5,
        contentDisposition: options.blobHTTPHeaders.blobContentDisposition,
        cacheControl: options.blobHTTPHeaders.blobCacheControl,
        blobType: Models.BlobType.BlockBlob
      },
      snapshot: "",
      isCommitted: true,
      persistencyID
    };

    // TODO: Need a lock for multi keys
    await this.dataStore.updateBlob(containerName, blob);

    // TODO: Make clean up async
    if (existingBlob && existingBlob.persistencyID) {
      await this.dataStore.deletePayloads([existingBlob.persistencyID]);
    }

    const response: Models.BlockBlobUploadResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: date,
      contentMD5: blob.properties.contentMD5,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date
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
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = new Date();

    const container = await this.dataStore.getContainer(containerName);
    if (!container) {
      throw StorageErrorFactory.getContainerNotFoundError(blobCtx.contextID!);
    }

    const existingBlock = await this.dataStore.getBlock(
      containerName,
      blobName,
      blockId
    );

    const persistencyID = await this.dataStore.writePayload(body);
    const block: BlockModel = {
      containerName,
      blobName,
      isCommitted: false,
      name: blockId,
      size: contentLength,
      persistencyID
    };
    await this.dataStore.updateBlock(block);

    // Create an uncommitted block blob if doesn't exist
    // TODO: Lock
    let blob = await this.dataStore.getBlob(containerName, blobName);
    if (!blob) {
      const etag = newEtag();
      blob = {
        deleted: false,
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
      await this.dataStore.updateBlob(containerName, blob);
    }
    // TODO: Unlock

    // TODO: Make clean up async
    if (existingBlock && existingBlock.persistencyID) {
      await this.dataStore.deletePayloads([existingBlock.persistencyID]);
    }

    const response: Models.BlockBlobStageBlockResponse = {
      statusCode: 201,
      contentMD5: new Uint8Array([0x00, 0x01, 0x02]),
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
    throw new NotImplementedError(context.contextID);
  }

  public async getBlockList(
    listType: Models.BlockListType,
    options: Models.BlockBlobGetBlockListOptionalParams,
    context: Context
  ): Promise<Models.BlockBlobGetBlockListResponse> {
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = new Date();

    const container = await this.dataStore.getContainer(containerName);
    if (!container) {
      throw StorageErrorFactory.getContainerNotFoundError(blobCtx.contextID!);
    }

    const blob = await this.dataStore.getBlob(containerName, blobName);
    if (!blob) {
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }

    const blockList = await this.dataStore.getBlocks(containerName, blobName);
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

    for (const block of blockList) {
      if (block.isCommitted) {
        response.committedBlocks!.push({
          name: block.name,
          size: block.size
        });
      } else {
        response.uncommittedBlocks!.push({
          name: block.name,
          size: block.size
        });
      }
    }

    return response;
  }
}
