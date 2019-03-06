import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlockBlobHandler from "../generated/handlers/IBlockBlobHandler";
import { BlobModel } from "../persistence/IBlobDataStore";
import { API_VERSION } from "../utils/constants";
import { newEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";

// tslint:disable:object-literal-sort-keys

export default class BlockBlobHandler extends BaseHandler
  implements IBlockBlobHandler {
  public async upload(
    body: NodeJS.ReadableStream,
    contentLength: number,
    options: Models.BlockBlobUploadOptionalParams,
    context: Context,
  ): Promise<Models.BlockBlobUploadResponse> {
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;

    const container = await this.dataStore.getContainer(containerName);
    if (!container) {
      throw StorageErrorFactory.getContainerNotFoundError(blobCtx.contextID!);
    }

    await this.dataStore.writeBlobPayload(containerName, blobName, body);

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
        blobType: Models.BlobType.BlockBlob,
      },
      snapshot: "",
      isCommitted: true,
    };

    await this.dataStore.updateBlob(containerName, blob);

    const response: Models.BlockBlobUploadResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: date,
      contentMD5: blob.properties.contentMD5,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date,
    };

    return response;
  }

  public async stageBlock(
    blockId: string,
    contentLength: number,
    body: NodeJS.ReadableStream,
    options: Models.BlockBlobStageBlockOptionalParams,
    context: Context,
  ): Promise<Models.BlockBlobStageBlockResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async stageBlockFromURL(
    blockId: string,
    contentLength: number,
    sourceUrl: string,
    options: Models.BlockBlobStageBlockFromURLOptionalParams,
    context: Context,
  ): Promise<Models.BlockBlobStageBlockFromURLResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async commitBlockList(
    blocks: Models.BlockLookupList,
    options: Models.BlockBlobCommitBlockListOptionalParams,
    context: Context,
  ): Promise<Models.BlockBlobCommitBlockListResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async getBlockList(
    listType: Models.BlockListType,
    options: Models.BlockBlobGetBlockListOptionalParams,
    context: Context,
  ): Promise<Models.BlockBlobGetBlockListResponse> {
    throw new NotImplementedError(context.contextID);
  }
}
