import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlobHandler from "../generated/handlers/IBlobHandler";
import ILogger from "../generated/utils/ILogger";
import IBlobDataStore, { BlobModel } from "../persistence/IBlobDataStore";
import { API_VERSION } from "../utils/constants";
import { deserializePageBlobRangeHeader, deserializeRangeHeader } from "../utils/utils";
import BaseHandler from "./BaseHandler";
import IPageBlobRangesManager from "./IPageBlobRangesManager";

export default class BlobHandler extends BaseHandler implements IBlobHandler {
  constructor(
    dataStore: IBlobDataStore,
    logger: ILogger,
    private readonly rangesManager: IPageBlobRangesManager
  ) {
    super(dataStore, logger);
  }

  public async download(
    options: Models.BlobDownloadOptionalParams,
    context: Context
  ): Promise<Models.BlobDownloadResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);

    if (blob.properties.blobType === Models.BlobType.BlockBlob) {
      return this.downloadBlockBlob(options, context);
    } else {
      return this.downloadPageBlob(options, context);
    }

    // TODO: Handle append blob
  }

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
      acceptRanges: undefined, // TODO:
      blobCommittedBlockCount: undefined, // TODO:
      isServerEncrypted: true,
      ...blob.properties
    };

    return response;
  }

  public async delete(
    options: Models.BlobDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.BlobDeleteResponse> {
    // Will throw exception first if blob does not exist before delete
    // need to use ts-ignore to avoid compilation error due to "noUnusedLocals": true,.
    // @ts-ignore
    const blob = await this.getSimpleBlobFromStorage(context);

    await this.dataStore.deleteBlob(
      blob.accountName,
      blob.containerName,
      blob.name
    );

    const response: Models.BlobDeleteResponse = {
      statusCode: 202,
      requestId: context.contextID,
      date: new Date(),
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

  public async setHTTPHeaders(
    options: Models.BlobSetHTTPHeadersOptionalParams,
    context: Context
  ): Promise<Models.BlobSetHTTPHeadersResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async setMetadata(
    options: Models.BlobSetMetadataOptionalParams,
    context: Context
  ): Promise<Models.BlobSetMetadataResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);
    const blobCtx = new BlobStorageContext(context);

    blob.metadata = options.metadata;

    await this.dataStore.updateBlob(blob);

    const response: Models.BlobSetMetadataResponse = {
      statusCode: 200,
      requestId: blobCtx.contextID,
      date: new Date(),
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
    context: Context
  ): Promise<Models.BlobDownloadResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);
    let blockBlob;
    if (blob.properties.blobType === Models.BlobType.BlockBlob) {
      blockBlob = blob;
    } else {
      throw StorageErrorFactory.getInvalidOperation(
        "Invalid blob type retrieval"
      );
    }
    // Deserializer doesn't handle range header currently
    // We manually parse range headers here
    const rangesParts = deserializeRangeHeader(
      context.request!.getHeader("range"),
      context.request!.getHeader("x-ms-range")
    );
    const rangeStart = rangesParts[0];
    let rangeEnd = rangesParts[1];

    // Will automatically shift request with longer data end than blob size to blob size
    if (rangeEnd + 1 >= blob.properties.contentLength!) {
      rangeEnd = blockBlob.properties.contentLength! - 1;
    }

    const contentLength = rangeEnd - rangeStart + 1;
    const partialRead = contentLength !== blob.properties.contentLength!;

    this.logger.info(
      // tslint:disable-next-line:max-line-length
      `BlobHandler:download() NormalizedDownloadRange=bytes=${rangeStart}-${rangeEnd} RequiredContentLength=${contentLength}`,
      context.contextID
    );

    let bodyGetter: () => Promise<NodeJS.ReadableStream | undefined>;
    const blocks = blockBlob!.committedBlocksInOrder;
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

    let body: NodeJS.ReadableStream | undefined = await bodyGetter();
    let contentMD5: Uint8Array | undefined;
    if (!partialRead) {
      contentMD5 = blob.properties.contentMD5;
    } else if (contentLength <= 4 * 1024 * 1024) {
      if (body) {
        // TODO： Get partial content MD5
        contentMD5 = undefined; // await getMD5FromStream(body);
        body = await bodyGetter();
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
    context: Context
  ): Promise<Models.BlobDownloadResponse> {
    const blobCtx = new BlobStorageContext(context);

    const blob = await this.getSimpleBlobFromStorage(context);

    // Deserializer doesn't handle range header currently
    // We manually parse range headers here
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
      `BlobHandler:download() NormalizedDownloadRange=bytes=${rangeStart}-${rangeEnd} RequiredContentLength=${contentLength}`,
      blobCtx.contextID
    );

    if (contentLength <= 0) {
      return {
        statusCode: 200,
        body: undefined,
        metadata: blob.metadata,
        eTag: blob.properties.etag,
        requestId: blobCtx.contextID,
        date: blobCtx.startTime!,
        version: API_VERSION,
        ...blob.properties,
        contentLength,
        contentMD5: undefined // TODO
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
      requestId: blobCtx.contextID,
      date: blobCtx.startTime!,
      version: API_VERSION,
      ...blob.properties,
      contentLength,
      contentMD5: undefined // TODO
    };

    return response;
  }

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
