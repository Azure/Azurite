import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IPageBlobHandler from "../generated/handlers/IPageBlobHandler";
import ILogger from "../generated/utils/ILogger";
import IBlobDataStore, { BlobModel } from "../persistence/IBlobDataStore";
import { API_VERSION } from "../utils/constants";
import { deserializePageBlobRangeHeader, newEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";
import BlobHandler from "./BlobHandler";
import IPageBlobRangesManager from "./IPageBlobRangesManager";

/**
 * PageBlobHandler handles Azure Storage PageBlob related requests.
 *
 * @export
 * @class PageBlobHandler
 * @extends {BaseHandler}
 * @implements {IPageBlobHandler}
 */
export default class PageBlobHandler extends BaseHandler
  implements IPageBlobHandler {
  constructor(
    dataStore: IBlobDataStore,
    logger: ILogger,
    private readonly rangesManager: IPageBlobRangesManager
  ) {
    super(dataStore, logger);
  }

  public async create(
    contentLength: number,
    blobContentLength: number,
    options: Models.PageBlobCreateOptionalParams,
    context: Context
  ): Promise<Models.PageBlobCreateResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    if (contentLength !== 0) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "Content-Length must be 0 for Create Page Blob request."
      );
    }

    if (blobContentLength % 512 !== 0) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "x-ms-content-length must be aligned to a 512-byte boundary."
      );
    }

    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentType =
      options.blobHTTPHeaders.blobContentType ||
      context.request!.getHeader("content-type") ||
      "application/octet-stream";

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    const etag = newEtag();
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
        contentLength: blobContentLength,
        contentType,
        contentEncoding: options.blobHTTPHeaders.blobContentEncoding,
        contentLanguage: options.blobHTTPHeaders.blobContentLanguage,
        contentMD5: options.blobHTTPHeaders.blobContentMD5,
        contentDisposition: options.blobHTTPHeaders.blobContentDisposition,
        cacheControl: options.blobHTTPHeaders.blobCacheControl,
        blobSequenceNumber: options.blobSequenceNumber,
        blobType: Models.BlobType.PageBlob,
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        serverEncrypted: true,
        accessTier: Models.AccessTier.P10, // TODO
        accessTierInferred: true
      },
      snapshot: "",
      isCommitted: true,
      pageRangesInOrder: []
    };

    // TODO: What's happens when create page blob right before commit block list? Or should we lock
    // Should we check if there is an uncommitted blob?
    this.dataStore.updateBlob(blob);

    const response: Models.PageBlobCreateResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: blob.properties.lastModified,
      contentMD5: blob.properties.contentMD5,
      requestId: context.contextID,
      version: API_VERSION,
      date,
      isServerEncrypted: true
    };

    return response;
  }

  public async uploadPages(
    body: NodeJS.ReadableStream,
    contentLength: number,
    options: Models.PageBlobUploadPagesOptionalParams,
    context: Context
  ): Promise<Models.PageBlobUploadPagesResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    if (contentLength % 512 !== 0) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "content-length or x-ms-content-length must be aligned to a 512-byte boundary."
      );
    }

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    let blob = await this.dataStore.getBlob(
      accountName,
      containerName,
      blobName
    );
    if (!blob) {
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }
    if (blob.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "Get Page Ranges could only be against a page blob."
      );
    }

    // Check Lease status
    BlobHandler.checkBlobLeaseOnWriteBlob(
      context,
      blob,
      options.leaseAccessConditions
    );

    const ranges = deserializePageBlobRangeHeader(
      blobCtx.request!.getHeader("range"),
      blobCtx.request!.getHeader("x-ms-range")
    );
    if (!ranges) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextID!);
    }

    const start = ranges[0];
    const end = ranges[1]; // Inclusive
    if (end - start + 1 !== contentLength) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextID!);
    }

    // Persisted request payload
    const persistency = await this.dataStore.writePayload(body);

    this.rangesManager.mergeRange(blob.pageRangesInOrder || [], {
      start,
      end,
      persistency
    });

    // set lease state to available if it's expired
    blob = BlobHandler.UpdateBlobLeaseStateOnWriteBlob(blob);
    await this.dataStore.updateBlob(blob);

    const response: Models.PageBlobUploadPagesResponse = {
      statusCode: 201,
      eTag: newEtag(),
      lastModified: date,
      contentMD5: undefined, // TODO
      blobSequenceNumber: blob.properties.blobSequenceNumber,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date,
      isServerEncrypted: true
    };

    return response;
  }

  public async clearPages(
    contentLength: number,
    options: Models.PageBlobClearPagesOptionalParams,
    context: Context
  ): Promise<Models.PageBlobClearPagesResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    if (contentLength !== 0) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "content-length or x-ms-content-length must be 0 for clear pages operation."
      );
    }

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    // TODO: Lock

    const blob = await this.dataStore.getBlob(
      accountName,
      containerName,
      blobName
    );
    if (!blob) {
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }
    if (blob.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "Get Page Ranges could only be against a page blob."
      );
    }

    const ranges = deserializePageBlobRangeHeader(
      blobCtx.request!.getHeader("range"),
      blobCtx.request!.getHeader("x-ms-range")
    );
    if (!ranges) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextID!);
    }
    const start = ranges[0];
    const end = ranges[1];

    this.rangesManager.clearRange(blob.pageRangesInOrder || [], {
      start,
      end
    });

    await this.dataStore.updateBlob(blob);

    const response: Models.PageBlobClearPagesResponse = {
      statusCode: 201,
      eTag: newEtag(),
      lastModified: date,
      contentMD5: undefined, // TODO
      blobSequenceNumber: blob.properties.blobSequenceNumber,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date
    };

    return response;
  }

  public async getPageRanges(
    options: Models.PageBlobGetPageRangesOptionalParams,
    context: Context
  ): Promise<Models.PageBlobGetPageRangesResponse> {
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
    if (blob.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "Get Page Ranges could only be against a page blob."
      );
    }

    let ranges = deserializePageBlobRangeHeader(
      blobCtx.request!.getHeader("range"),
      blobCtx.request!.getHeader("x-ms-range")
    );
    if (!ranges) {
      ranges = [0, blob.properties.contentLength! - 1];
    }

    blob.pageRangesInOrder = blob.pageRangesInOrder || [];
    const impactedRanges = this.rangesManager.cutRanges(
      blob.pageRangesInOrder,
      {
        start: ranges[0],
        end: ranges[1]
      }
    );

    const response: Models.PageBlobGetPageRangesResponse = {
      statusCode: 200,
      pageRange: impactedRanges,
      eTag: blob.properties.etag,
      blobContentLength: blob.properties.contentLength,
      lastModified: date,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date
    };

    return response;
  }

  public getPageRangesDiff(
    options: Models.PageBlobGetPageRangesDiffOptionalParams,
    context: Context
  ): Promise<Models.PageBlobGetPageRangesDiffResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async resize(
    blobContentLength: number,
    options: Models.PageBlobResizeOptionalParams,
    context: Context
  ): Promise<Models.PageBlobResizeResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = blobCtx.startTime!;

    if (blobContentLength % 512 !== 0) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "x-ms-blob-content-length must be aligned to a 512-byte boundary for Page Blob Resize request."
      );
    }

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
    if (blob.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "Resize could only be against a page blob."
      );
    }

    blob.pageRangesInOrder = blob.pageRangesInOrder || [];
    if (blob.properties.contentLength! > blobContentLength) {
      const start = blobContentLength;
      const end = blob.properties.contentLength! - 1;
      this.rangesManager.clearRange(blob.pageRangesInOrder || [], {
        start,
        end
      });
    }

    blob.properties.contentLength = blobContentLength;
    blob.properties.lastModified = blobCtx.startTime!;

    this.dataStore.updateBlob(blob);

    const response: Models.PageBlobResizeResponse = {
      statusCode: 200,
      eTag: newEtag(),
      lastModified: blob.properties.lastModified,
      blobSequenceNumber: blob.properties.blobSequenceNumber,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date
    };

    return response;
  }

  public async updateSequenceNumber(
    sequenceNumberAction: Models.SequenceNumberActionType,
    options: Models.PageBlobUpdateSequenceNumberOptionalParams,
    context: Context
  ): Promise<Models.PageBlobUpdateSequenceNumberResponse> {
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

    // TODO: Lock

    const blob = await this.dataStore.getBlob(
      accountName,
      containerName,
      blobName
    );
    if (!blob) {
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }
    if (blob.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "Get Page Ranges could only be against a page blob."
      );
    }

    if (blob.properties.blobSequenceNumber === undefined) {
      blob.properties.blobSequenceNumber = 0;
    }

    switch (sequenceNumberAction) {
      case Models.SequenceNumberActionType.Max:
        if (options.blobSequenceNumber === undefined) {
          throw StorageErrorFactory.getInvalidOperation(
            blobCtx.contextID!,
            "x-ms-blob-sequence-number is required when x-ms-sequence-number-action is set to max."
          );
        }
        blob.properties.blobSequenceNumber = Math.max(
          blob.properties.blobSequenceNumber,
          options.blobSequenceNumber
        );
        break;
      case Models.SequenceNumberActionType.Increment:
        if (options.blobSequenceNumber !== undefined) {
          throw StorageErrorFactory.getInvalidOperation(
            blobCtx.contextID!,
            "x-ms-blob-sequence-number cannot be provided when x-ms-sequence-number-action is set to increment."
          );
        }
        blob.properties.blobSequenceNumber++;
        break;
      case Models.SequenceNumberActionType.Update:
        if (options.blobSequenceNumber === undefined) {
          throw StorageErrorFactory.getInvalidOperation(
            blobCtx.contextID!,
            "x-ms-blob-sequence-number is required when x-ms-sequence-number-action is set to update."
          );
        }
        blob.properties.blobSequenceNumber = options.blobSequenceNumber;
        break;
      default:
        throw StorageErrorFactory.getInvalidOperation(
          blobCtx.contextID!,
          "Unsupported x-ms-sequence-number-action value."
        );
    }

    this.dataStore.updateBlob(blob);

    const response: Models.PageBlobUpdateSequenceNumberResponse = {
      statusCode: 200,
      eTag: newEtag(),
      lastModified: blob.properties.lastModified,
      blobSequenceNumber: blob.properties.blobSequenceNumber,
      requestId: blobCtx.contextID,
      version: API_VERSION,
      date
    };

    return response;
  }

  public copyIncremental(
    copySource: string,
    options: Models.PageBlobCopyIncrementalOptionalParams,
    context: Context
  ): Promise<Models.PageBlobCopyIncrementalResponse> {
    throw new NotImplementedError(context.contextID);
  }
}
