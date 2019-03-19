import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IPageBlobHandler from "../generated/handlers/IPageBlobHandler";
import { BlobModel } from "../persistence/IBlobDataStore";
import { API_VERSION } from "../utils/constants";
import { newEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";

export default class PageBlobHandler extends BaseHandler
  implements IPageBlobHandler {
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
      // TODO: Which error should return?
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "Content-Length must be 0 for Create Page Blob request."
      );
    }

    if (blobContentLength % 512 !== 0) {
      // TODO: Which error should return?
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextID!,
        "x-ms-content-length must be aligned to a 512-byte boundary."
      );
    }

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    const etag = newEtag();
    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
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
        contentType: options.blobHTTPHeaders.blobContentType,
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
      isCommitted: true
    };

    // TODO: What's happens when create page blob right before commit block list?
    this.dataStore.updateBlob(blob);

    const response: Models.PageBlobCreateResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: blob.properties.lastModified,
      contentMD5: blob.properties.contentMD5,
      requestId: blobCtx.contextID,
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
      // TODO: Which error should return?
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

    options.range =
      options.range ||
      blobCtx.request!.getHeader("x-ms-range") ||
      blobCtx.request!.getHeader("range");
    const ranges = this.deserializeRangeHeader(options.range);
    if (!ranges) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextID!);
    }

    const start = ranges[0];
    const end = ranges[1];
    const numberOfPages = (end - start + 1) / 512;

    const persistencyID = await this.dataStore.writePayload(body);

    // TODO: Bad performance to store lots of 512bytes files in disk
    // Optimize persistencyID to {persistencyID, offset, length}, which allow
    // different page ranges point to same persistency extent with different offsets
    const promises = []; // Promises to duplicate "big" payload into payloads with 512 size
    for (let i = 0; i < numberOfPages; i++) {
      promises.push(
        new Promise<string>((resolve, reject) => {
          this.dataStore
            .readPayload(persistencyID, i * 512, 512)
            .then(rs => {
              this.dataStore
                .writePayload(rs)
                .then(resolve)
                .catch(reject);
            })
            .catch(reject);
        })
      );
    }

    const persistencyIDs = await Promise.all(promises);

    await this.dataStore.deletePayloads([persistencyID]);

    blob.pageRanges = blob.pageRanges || {};

    for (let i = 0; i < numberOfPages; i++) {
      const offset = i * 512 + start;
      blob.pageRanges![offset] = {
        start: offset,
        end: offset + 511,
        persistencyID: persistencyIDs[i]
      };
    }

    await this.dataStore.updateBlob(blob);

    const response: Models.PageBlobUploadPagesResponse = {
      statusCode: 201,
      eTag: newEtag(), // TODO
      lastModified: date,
      contentMD5: undefined, // TODO
      blobSequenceNumber: blob.properties.blobSequenceNumber, // TODO
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
      // TODO: Which error should return?
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

    options.range =
      options.range ||
      blobCtx.request!.getHeader("x-ms-range") ||
      blobCtx.request!.getHeader("range");
    const ranges = this.deserializeRangeHeader(options.range);
    if (!ranges) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextID!);
    }

    const start = ranges[0];
    const end = ranges[1];
    const numberOfPages = (end - start + 1) / 512;

    blob.pageRanges = blob.pageRanges || {};

    // Clear selected ranges
    // TODO: GC unlinked persistency chunks
    for (let i = 0; i < numberOfPages; i++) {
      const offset = i * 512 + start;
      delete blob.pageRanges![offset];
    }

    await this.dataStore.updateBlob(blob);

    const response: Models.PageBlobClearPagesResponse = {
      statusCode: 201,
      eTag: newEtag(), // TODO
      lastModified: date,
      contentMD5: undefined, // TODO
      blobSequenceNumber: blob.properties.blobSequenceNumber, // TODO
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

    options.range =
      options.range ||
      blobCtx.request!.getHeader("x-ms-range") ||
      blobCtx.request!.getHeader("range");
    let ranges = this.deserializeRangeHeader(options.range);
    if (!ranges) {
      ranges = [0, blob.properties.contentLength! - 1];
    }

    const start = ranges[0];
    const end = ranges[1];
    const numberOfPages = (end - start + 1) / 512;

    blob.pageRanges = blob.pageRanges || {};
    const pageRanges: Models.PageRange[] = [];

    // TODO: Merge ranges
    for (let i = 0; i < numberOfPages; i++) {
      const offset = i * 512 + start;
      const pageRange = blob.pageRanges![offset];
      if (pageRange) {
        pageRanges.push(pageRange);
      }
    }

    const response: Models.PageBlobGetPageRangesResponse = {
      statusCode: 200,
      pageRange: pageRanges,
      eTag: newEtag(), // TODO
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
      // TODO: Which error should return?
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

    blob.pageRanges = blob.pageRanges || {};
    if (blob.properties.contentLength! > blobContentLength) {
      for (
        let rangeOffset = blobContentLength;
        rangeOffset < blob.properties.contentLength!;
        rangeOffset += 512
      ) {
        // TODO: GC unlinked persistency chunks
        delete blob.pageRanges[rangeOffset];
      }
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

  /**
   * Deserialize range header into valid page ranges.
   * For example, "bytes=0-1023" will return [0, 1023].
   * Empty of invalid range headers will return undefined.
   *
   * @private
   * @param {string} [rangeHeaderValue]
   * @param {string} [xMsRangeHeaderValue]
   * @returns {([number, number] | undefined)}
   * @memberof PageBlobHandler
   */
  private deserializeRangeHeader(
    rangeHeaderValue?: string,
    xMsRangeHeaderValue?: string
  ): [number, number] | undefined {
    const range = rangeHeaderValue || xMsRangeHeaderValue;
    if (!range) {
      return undefined;
    }

    let parts = range.split("=");
    if (parts === undefined || parts.length !== 2) {
      return undefined;
    }

    parts = parts[1].split("-");
    if (parts === undefined || parts.length !== 2) {
      return undefined;
    }

    const startInclusive = parseInt(parts[0], 10);
    const endInclusive = parseInt(parts[1], 10);

    if (startInclusive >= endInclusive) {
      return undefined;
    }

    if (startInclusive % 512 !== 0) {
      return undefined;
    }

    if ((endInclusive + 1) % 512 !== 0) {
      return undefined;
    }

    return [startInclusive, endInclusive];
  }
}
