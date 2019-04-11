import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlobHandler from "../generated/handlers/IBlobHandler";
import ILogger from "../generated/utils/ILogger";
import IBlobDataStore, { BlobModel } from "../persistence/IBlobDataStore";
import { API_VERSION } from "../utils/constants";
import {
  deserializePageBlobRangeHeader,
  deserializeRangeHeader
} from "../utils/utils";
import BaseHandler from "./BaseHandler";
import IPageBlobRangesManager from "./IPageBlobRangesManager";

/**
 * BlobHandler handles Azure Storage Blob related requests.
 *
 * @export
 * @class BlobHandler
 * @extends {BaseHandler}
 * @implements {IBlobHandler}
 */
export default class BlobHandler extends BaseHandler implements IBlobHandler {
  constructor(
    dataStore: IBlobDataStore,
    logger: ILogger,
    private readonly rangesManager: IPageBlobRangesManager
  ) {
    super(dataStore, logger);
  }

  /**
   * Download blob.
   *
   * @param {Models.BlobDownloadOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobDownloadResponse>}
   * @memberof BlobHandler
   */
  public async download(
    options: Models.BlobDownloadOptionalParams,
    context: Context
  ): Promise<Models.BlobDownloadResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);

    if (blob.properties.blobType === Models.BlobType.BlockBlob) {
      return this.downloadBlockBlob(options, context, blob);
    } else if (blob.properties.blobType === Models.BlobType.PageBlob) {
      return this.downloadPageBlob(options, context, blob);
    } else if (blob.properties.blobType === Models.BlobType.AppendBlob) {
      // TODO: Handle append blob
      throw new NotImplementedError(context.contextID);
    } else {
      throw StorageErrorFactory.getInvalidOperation(context.contextID!);
    }
  }

  /**
   * Get blob properties.
   *
   * @param {Models.BlobGetPropertiesOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobGetPropertiesResponse>}
   * @memberof BlobHandler
   */
  public async getProperties(
    options: Models.BlobGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.BlobGetPropertiesResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);

    const response: Models.BlobGetPropertiesResponse = {
      statusCode: 200,
      metadata: blob.metadata,
      isIncrementalCopy: blob.properties.incrementalCopy,
      eTag: blob.properties.etag,
      requestId: context.contextID,
      version: API_VERSION,
      date: context.startTime,
      acceptRanges: "bytes",
      blobCommittedBlockCount: undefined, // TODO: Append blob
      isServerEncrypted: true,
      ...blob.properties
    };

    return response;
  }

  /**
   * Delete blob.
   *
   * @param {Models.BlobDeleteMethodOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobDeleteResponse>}
   * @memberof BlobHandler
   */
  public async delete(
    options: Models.BlobDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.BlobDeleteResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);

    await this.dataStore.deleteBlob(
      blob.accountName,
      blob.containerName,
      blob.name
    );

    const response: Models.BlobDeleteResponse = {
      statusCode: 202,
      requestId: context.contextID,
      date: context.startTime,
      version: API_VERSION
    };

    return response;
  }

  public async undelete(
    options: Models.BlobUndeleteOptionalParams,
    context: Context
  ): Promise<Models.BlobUndeleteResponse> {
    throw new NotImplementedError(context.contextID);
  }

  // see also https://docs.microsoft.com/en-us/rest/api/storageservices/set-blob-properties
  public async setHTTPHeaders(
    options: Models.BlobSetHTTPHeadersOptionalParams,
    context: Context
  ): Promise<Models.BlobSetHTTPHeadersResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);
    const blobHeaders = options.blobHTTPHeaders;
    let blobProps = blob.properties;

    // as per https://docs.microsoft.com/en-us/rest/api/storageservices/set-blob-properties#remarks
    // If any one or more of the following properties is set in the request,
    // then all of these properties are set together.
    // If a value is not provided for a given property when at least one
    // of the properties listed below is set, then that property will
    // be cleared for the blob.
    if (blobHeaders != undefined) {
      blobProps.cacheControl = blobHeaders.blobCacheControl;
      blobProps.contentType = blobHeaders.blobContentType;
      blobProps.contentMD5 = blobHeaders.blobContentMD5;
      blobProps.contentEncoding = blobHeaders.blobContentEncoding;
      blobProps.contentLanguage = blobHeaders.blobContentLanguage;
      blobProps.contentDisposition = blobHeaders.blobContentDisposition;
      blobProps.lastModified = context.startTime
        ? context.startTime
        : new Date();
    }

    blob.properties = blobProps;
    await this.dataStore.updateBlob(blob);

    // ToDo: return correct headers and test for these.
    const response: Models.BlobSetHTTPHeadersResponse = {
      statusCode: 200,
      eTag: blob.properties.etag,
      lastModified: blob.properties.lastModified,
      blobSequenceNumber: blob.properties.blobSequenceNumber,
      requestId: context.contextID,
      version: API_VERSION,
      date: context.startTime
    };

    return response;
  }

  public async setMetadata(
    options: Models.BlobSetMetadataOptionalParams,
    context: Context
  ): Promise<Models.BlobSetMetadataResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);

    blob.metadata = options.metadata;
    await this.dataStore.updateBlob(blob);

    // ToDo: return correct headers and test for these.
    const response: Models.BlobSetMetadataResponse = {
      statusCode: 200,
      eTag: blob.properties.etag,
      lastModified: blob.properties.lastModified,
      isServerEncrypted: true,
      requestId: context.contextID,
      date: context.startTime,
      version: API_VERSION
    };

    return response;
  }

  public async acquireLease(
    options: Models.BlobAcquireLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobAcquireLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async releaseLease(
    leaseId: string,
    options: Models.BlobReleaseLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobReleaseLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async renewLease(
    leaseId: string,
    options: Models.BlobRenewLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobRenewLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async changeLease(
    leaseId: string,
    proposedLeaseId: string,
    options: Models.BlobChangeLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobChangeLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async breakLease(
    options: Models.BlobBreakLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobBreakLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async createSnapshot(
    options: Models.BlobCreateSnapshotOptionalParams,
    context: Context
  ): Promise<Models.BlobCreateSnapshotResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async startCopyFromURL(
    copySource: string,
    options: Models.BlobStartCopyFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlobStartCopyFromURLResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async abortCopyFromURL(
    copyId: string,
    options: Models.BlobAbortCopyFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlobAbortCopyFromURLResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async setTier(
    tier: Models.AccessTier,
    options: Models.BlobSetTierOptionalParams,
    context: Context
  ): Promise<Models.BlobSetTierResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async getAccountInfo(
    context: Context
  ): Promise<Models.BlobGetAccountInfoResponse> {
    throw new NotImplementedError(context.contextID);
  }

  private async downloadBlockBlob(
    options: Models.BlobDownloadOptionalParams,
    context: Context,
    blob: BlobModel
  ): Promise<Models.BlobDownloadResponse> {
    if (blob.isCommitted === false) {
      throw StorageErrorFactory.getBlobNotFound(context.contextID!);
    }

    // Deserializer doesn't handle range header currently, manually parse range headers here
    const rangesParts = deserializeRangeHeader(
      context.request!.getHeader("range"),
      context.request!.getHeader("x-ms-range")
    );
    const rangeStart = rangesParts[0];
    let rangeEnd = rangesParts[1];

    // Will automatically shift request with longer data end than blob size to blob size
    if (rangeEnd + 1 >= blob.properties.contentLength!) {
      rangeEnd = blob.properties.contentLength! - 1;
    }

    const contentLength = rangeEnd - rangeStart + 1;
    const partialRead = contentLength !== blob.properties.contentLength!;

    this.logger.info(
      // tslint:disable-next-line:max-line-length
      `BlobHandler:downloadBlockBlob() NormalizedDownloadRange=bytes=${rangeStart}-${rangeEnd} RequiredContentLength=${contentLength}`,
      context.contextID
    );

    let bodyGetter: () => Promise<NodeJS.ReadableStream | undefined>;
    const blocks = blob.committedBlocksInOrder;
    if (blocks === undefined || blocks.length === 0) {
      bodyGetter = async () => {
        return this.dataStore.readPayload(
          blob.persistency,
          rangeStart,
          rangeEnd + 1 - rangeStart
        );
      };
    } else {
      bodyGetter = async () => {
        return this.dataStore.readPayloads(
          blocks.map(block => block.persistency),
          rangeStart,
          rangeEnd + 1 - rangeStart
        );
      };
    }

    const body: NodeJS.ReadableStream | undefined = await bodyGetter();
    let contentMD5: Uint8Array | undefined;
    if (!partialRead) {
      contentMD5 = blob.properties.contentMD5;
    } else if (contentLength <= 4 * 1024 * 1024) {
      if (body) {
        // TODO： Get partial content MD5
        contentMD5 = undefined; // await getMD5FromStream(body);
      }
    }

    const response: Models.BlobDownloadResponse = {
      statusCode: 200,
      body,
      metadata: blob.metadata,
      eTag: blob.properties.etag,
      requestId: context.contextID,
      date: context.startTime!,
      version: API_VERSION,
      ...blob.properties,
      contentLength,
      contentMD5
    };

    return response;
  }

  private async downloadPageBlob(
    options: Models.BlobDownloadOptionalParams,
    context: Context,
    blob: BlobModel
  ): Promise<Models.BlobDownloadResponse> {
    // Deserializer doesn't handle range header currently, manually parse range headers here
    const rangesParts = deserializePageBlobRangeHeader(
      context.request!.getHeader("range"),
      context.request!.getHeader("x-ms-range")
    );
    const rangeStart = rangesParts[0];
    let rangeEnd = rangesParts[1];

    // Will automatically shift request with longer data end than blob size to blob size
    if (rangeEnd + 1 >= blob.properties.contentLength!) {
      rangeEnd = blob.properties.contentLength! - 1;
    }

    const contentLength = rangeEnd - rangeStart + 1;
    // const partialRead = contentLength !== blob.properties.contentLength!;

    this.logger.info(
      // tslint:disable-next-line:max-line-length
      `BlobHandler:downloadPageBlob() NormalizedDownloadRange=bytes=${rangeStart}-${rangeEnd} RequiredContentLength=${contentLength}`,
      context.contextID
    );

    if (contentLength <= 0) {
      return {
        statusCode: 200,
        body: undefined,
        metadata: blob.metadata,
        eTag: blob.properties.etag,
        requestId: context.contextID,
        date: context.startTime!,
        version: API_VERSION,
        ...blob.properties,
        contentLength,
        contentMD5: undefined
      };
    }

    blob.pageRangesInOrder = blob.pageRangesInOrder || [];
    const ranges = this.rangesManager.fillZeroRanges(blob.pageRangesInOrder, {
      start: rangeStart,
      end: rangeEnd
    });

    const bodyGetter = async () => {
      return this.dataStore.readPayloads(
        ranges.map(value => value.persistency),
        0,
        contentLength
      );
    };

    const body: NodeJS.ReadableStream | undefined = await bodyGetter();
    // let contentMD5: Uint8Array | undefined;
    // if (!partialRead) {
    //   contentMD5 = blob.properties.contentMD5;
    // } else if (contentLength <= 4 * 1024 * 1024) {
    //   if (body) {
    //     // TODO： Get partial content MD5
    //     contentMD5 = undefined; // await getMD5FromStream(body);
    //     body = await bodyGetter();
    //   }
    // }

    const response: Models.BlobDownloadResponse = {
      statusCode: 200,
      body,
      metadata: blob.metadata,
      eTag: blob.properties.etag,
      requestId: context.contextID,
      date: context.startTime!,
      version: API_VERSION,
      ...blob.properties,
      contentLength,
      contentMD5: undefined // TODO
    };

    return response;
  }

  /**
   * Get blob object from persistency layer according to request context.
   *
   * @private
   * @param {Context} context
   * @returns {Promise<BlobModel>}
   * @memberof BlobHandler
   */
  private async getSimpleBlobFromStorage(context: Context): Promise<BlobModel> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;

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

    return blob;
  }
}
