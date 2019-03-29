import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IPageBlobHandler from "../generated/handlers/IPageBlobHandler";
import { BlobModel, PersistencyPageRange } from "../persistence/IBlobDataStore";
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
      isCommitted: true,
      pageRangesInOrder: []
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
    const ranges = PageBlobHandler.deserializeRangeHeader(options.range);
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

    /********** Ranges Merging Strategy ************/
    //
    // Example:
    // Existing ranges: |---| |------|    |---------|  |-----|
    // New range      :          |----------------------|
    //
    // 4 existing ranges, and one new request range.
    // Above 4 existing ranges, 3 existing ranges are get impacted.
    //
    // We have 2 merging strategies:
    // #1 Merge all impacted ranges
    //                : |---| |**------------------------****|
    // #2 Split first and last impacted existing ranges:
    //                : |---| |**|----------------------|****|
    //
    // Question:
    // Every range has a pointer to a chunk in one persistency layer extent.
    // When implementing Get Page Ranges Diff request, we will assume 2 (sub)ranges
    // are same if they pointing to same range of an extent. (Or we can comparing the
    // persistency layer payload, but it's not efficiency.)
    //
    // For #1 strategy, Get Page Ranges Diff will return a larger range scope than
    // the actual changed. Above ranges marked as * will point to new allocated extent,
    // while in previous snapshot, they still point to old extent.
    // One potential workaround is to update these ranges in snapshot blob to pointing
    // to same new allocated extent. But this will make implementation of update ranges
    // more complex, and also makes snapshot mutable.
    // Another concern is that, the * ranges may have large footprint, which is
    // time consuming.
    //
    // For #2 strategy, there will be more and more small ranges. See the |**| and |****|.
    // But it's able . We can make the "merging" work to future GC.
    //
    // We choose #2 strategy, and leave the merging work to future GC, which will merging
    // small ranges in background.
    //
    // TODO for #2 strategy:
    // * Resize API: Should remove additional ranges
    // * Download Page Blob API after resize (shift): Should taking resize into consideration
    // * Clean Ranges API: Same strategy like update ranges
    // * Page Blob GC for Ranges Merger: Merge small ranges and extent chunks for page blob and snapshots
    // * GC for un-referred extents

    // Find out existing impacted ranges list
    blob.pageRangesInOrder = blob.pageRangesInOrder || [];
    const impactedScope = PageBlobHandler.selectImpactedRanges(
      blob.pageRangesInOrder,
      start,
      end
    );

    // Find out first and last impacted range index
    const impactedStartIndex = impactedScope[0];
    const impactedEndIndex = impactedScope[1];
    const impactedRangesCount =
      impactedStartIndex > impactedEndIndex // No impacted ranges
        ? 0
        : impactedEndIndex - impactedStartIndex + 1;

    // New created range for this request payload
    const newRange: PersistencyPageRange = { start, end, persistency };

    if (impactedRangesCount === 0) {
      // If there is no existing impacted range, just insert the new range
      blob.pageRangesInOrder.splice(impactedStartIndex, 0, newRange);
    } else {
      // Otherwise, try to split the first and last impacted ranges
      const firstImpactedRange = blob.pageRangesInOrder[impactedStartIndex];
      const lastImpactedRange = blob.pageRangesInOrder[impactedEndIndex];

      // Ranges to be inserted
      const newRanges = [];

      // If first range needs to be split, push the split range
      if (firstImpactedRange.end >= start && firstImpactedRange.start < start) {
        newRanges.push({
          start: firstImpactedRange.start,
          end: start - 1,
          persistency: {
            id: firstImpactedRange.persistency.id,
            offset: firstImpactedRange.persistency.offset,
            count: start - firstImpactedRange.start
          }
        });
      }

      newRanges.push(newRange);

      // If last impacted range needs to be split, push the split range
      if (end >= lastImpactedRange.start && end < lastImpactedRange.end) {
        newRanges.push({
          start: end + 1,
          end: lastImpactedRange.end,
          persistency: {
            id: lastImpactedRange.persistency.id,
            offset:
              lastImpactedRange.persistency.offset +
              (end + 1 - lastImpactedRange.start),
            count: lastImpactedRange.end - end
          }
        });
      }

      blob.pageRangesInOrder.splice(
        impactedStartIndex,
        impactedRangesCount,
        ...newRanges
      );
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
    const ranges = PageBlobHandler.deserializeRangeHeader(options.range);
    if (!ranges) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextID!);
    }
    const start = ranges[0];
    const end = ranges[1];

    // Find out existing impacted ranges list
    blob.pageRangesInOrder = blob.pageRangesInOrder || [];
    const impactedScope = PageBlobHandler.selectImpactedRanges(
      blob.pageRangesInOrder,
      start,
      end
    );

    // Find out first and last impacted range index
    const impactedStartIndex = impactedScope[0];
    const impactedEndIndex = impactedScope[1];
    const impactedRangesCount =
      impactedStartIndex > impactedEndIndex // No impacted ranges
        ? 0
        : impactedEndIndex - impactedStartIndex + 1;

    if (impactedRangesCount > 0) {
      // Try to split the first and last impacted ranges
      const firstImpactedRange = blob.pageRangesInOrder[impactedStartIndex];
      const lastImpactedRange = blob.pageRangesInOrder[impactedEndIndex];

      // Ranges to be inserted
      const newRanges = [];

      // If first range needs to be split, push the split range
      if (firstImpactedRange.end >= start && firstImpactedRange.start < start) {
        newRanges.push({
          start: firstImpactedRange.start,
          end: start - 1,
          persistency: {
            id: firstImpactedRange.persistency.id,
            offset: firstImpactedRange.persistency.offset,
            count: start - firstImpactedRange.start
          }
        });
      }

      // If last impacted range needs to be split, push the split range
      if (end >= lastImpactedRange.start && end < lastImpactedRange.end) {
        newRanges.push({
          start: end + 1,
          end: lastImpactedRange.end,
          persistency: {
            id: lastImpactedRange.persistency.id,
            offset:
              lastImpactedRange.persistency.offset +
              (end + 1 - lastImpactedRange.start),
            count: lastImpactedRange.end - end
          }
        });
      }

      blob.pageRangesInOrder.splice(
        impactedStartIndex,
        impactedRangesCount,
        ...newRanges
      );
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
    let ranges = PageBlobHandler.deserializeRangeHeader(options.range);
    if (!ranges) {
      ranges = [0, blob.properties.contentLength! - 1];
    }
    const start = ranges[0];
    const end = ranges[1];

    blob.pageRangesInOrder = blob.pageRangesInOrder || [];
    const impactedScope = PageBlobHandler.selectImpactedRanges(
      blob.pageRangesInOrder,
      start,
      end
    );

    // Find out first and last impacted range index
    const impactedStartIndex = impactedScope[0];
    const impactedEndIndex = impactedScope[1];
    const impactedRangesCount =
      impactedStartIndex > impactedEndIndex
        ? 0 // No impacted ranges
        : impactedEndIndex - impactedStartIndex + 1;
    const impactedRanges: Models.PageRange[] = blob.pageRangesInOrder.slice(
      impactedStartIndex,
      impactedEndIndex + 1
    );

    if (impactedRangesCount > 0) {
      // If first range needs to be split
      const firstImpactedRange = impactedRanges[0];
      if (firstImpactedRange.end >= start && firstImpactedRange.start < start) {
        impactedRanges[0] = {
          start,
          end: firstImpactedRange.end
        };
      }

      const lastImpactedRange = impactedRanges[impactedRanges.length - 1];
      // If last impacted range needs to be split
      if (end >= lastImpactedRange.start && end < lastImpactedRange.end) {
        impactedRanges[impactedRanges.length - 1] = {
          start: lastImpactedRange.start,
          end
        };
      }
    }

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

    // TODO: Create a PageRangesManager to abstract complex ranges handling codes

    blob.pageRangesInOrder = blob.pageRangesInOrder || [];
    if (blob.properties.contentLength! > blobContentLength) {
      const start = blobContentLength;
      const end = blob.properties.contentLength! - 1;

      // Find out existing impacted ranges list
      const impactedScope = PageBlobHandler.selectImpactedRanges(
        blob.pageRangesInOrder,
        start,
        end
      );

      // Find out first and last impacted range index
      const impactedStartIndex = impactedScope[0];
      const impactedEndIndex = impactedScope[1];
      const impactedRangesCount =
        impactedStartIndex > impactedEndIndex // No impacted ranges
          ? 0
          : impactedEndIndex - impactedStartIndex + 1;

      if (impactedRangesCount > 0) {
        const newRanges = [];

        // Try to split the first and last impacted ranges
        const firstImpactedRange = blob.pageRangesInOrder[impactedStartIndex];

        // If first range needs to be split, push the split range
        if (
          firstImpactedRange.end >= start &&
          firstImpactedRange.start < start
        ) {
          newRanges.push({
            start: firstImpactedRange.start,
            end: start - 1,
            persistency: {
              id: firstImpactedRange.persistency.id,
              offset: firstImpactedRange.persistency.offset,
              count: start - firstImpactedRange.start
            }
          });
        }

        blob.pageRangesInOrder.splice(
          impactedStartIndex,
          impactedRangesCount,
          ...newRanges
        );
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
   * Select overlapped ranges based on binary search.
   *
   * Mark public for unit testing only.
   *
   * @private
   * @param {PersistencyPageRange[]} ranges Existing ranges
   * @param {number} start Start offset of the new range, inclusive
   * @param {number} end End offset of the new range, inclusive
   * @returns {PersistencyPageRange[]}
   * @memberof PageBlobHandler
   */

  /**
   * Select overlapped ranges based on binary search.
   *
   * Mark public for unit testing only.
   * // TODO: Put page range handle logic into single class
   *
   * @private
   * @param {PersistencyPageRange[]} ranges Existing ranges
   * @param {number} start Start offset of the new range, inclusive
   * @param {number} end End offset of the new range, inclusive
   * @returns {[number, number]} Impacted start and end ranges indexes tuple
   *                             When no impacted ranges found, will return indexes
   *                             for 2 closet existing ranges
   *                             [FirstLargerRangeIndex, FirstSmallerRangeIndex]
   * @memberof PageBlobHandler
   */
  public static selectImpactedRanges(
    ranges: PersistencyPageRange[],
    start: number,
    end: number
  ): [number, number] {
    if (ranges.length === 0) {
      return [Infinity, -1];
    }

    if (start > end || start < 0) {
      throw new RangeError(
        // tslint:disable-next-line:max-line-length
        "PageBlobHandler:selectImpactedRanges() start must less equal than end parameter, start must larger equal than 0."
      );
    }

    const impactedRangeStartIndex = PageBlobHandler.locateFirstImpactedRange(
      ranges,
      0,
      ranges.length,
      start
    );

    const impactedRangesEndIndex = PageBlobHandler.locateLastImpactedRange(
      ranges,
      0,
      ranges.length,
      end
    );

    return [impactedRangeStartIndex, impactedRangesEndIndex];
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
  private static deserializeRangeHeader(
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

  /**
   * Locate first impacted range for a given position.
   *
   * @private
   * @param {PersistencyPageRange[]} ranges
   * @param {number} searchStart Index of start range in ranges array, inclusive
   * @param {number} searchEnd Index of end range in ranges array, exclusive
   * @param {number} position First range index covers or larger than position will be returned
   * @returns {number} Index of first impacted range or Infinity for no results
   * @memberof PageBlobHandler
   */
  private static locateFirstImpactedRange(
    ranges: PersistencyPageRange[],
    searchStart: number,
    searchEnd: number,
    position: number
  ): number {
    searchStart = searchStart < 0 ? 0 : searchStart;
    searchEnd = searchEnd > ranges.length ? searchEnd : searchEnd;
    if (ranges.length === 0 || searchStart >= searchEnd) {
      return Infinity;
    }

    // Only last element to check
    if (searchStart === searchEnd - 1) {
      return PageBlobHandler.positionInRange(ranges[searchStart], position) ||
        position < ranges[searchStart].start
        ? searchStart
        : Infinity;
    }

    // 2 or more elements left
    const searchMid = Math.floor((searchStart + searchEnd) / 2);
    const indexInLeft = PageBlobHandler.locateFirstImpactedRange(
      ranges,
      searchStart,
      searchMid,
      position
    );
    if (indexInLeft !== Infinity) {
      return indexInLeft;
    }
    if (
      PageBlobHandler.positionInRange(ranges[searchMid], position) ||
      position < ranges[searchMid].start
    ) {
      return searchMid;
    } else {
      return PageBlobHandler.locateFirstImpactedRange(
        ranges,
        searchMid + 1, // Remove searchMid range from searching scope
        searchEnd,
        position
      );
    }
  }

  /**
   * Locate last impacted range for a given position.
   *
   * @private
   * @param {PersistencyPageRange[]} ranges
   * @param {number} searchStart Index of start range in ranges array, inclusive
   * @param {number} searchEnd Index of end range in ranges array, exclusive
   * @param {number} position Last range index covers or less than position will be returned
   * @returns {number} Index of first impacted range or -1 for no results
   * @memberof PageBlobHandler
   */
  private static locateLastImpactedRange(
    ranges: PersistencyPageRange[],
    searchStart: number,
    searchEnd: number,
    position: number
  ): number {
    searchStart = searchStart < 0 ? 0 : searchStart;
    searchEnd = searchEnd > ranges.length ? searchEnd : searchEnd;
    if (ranges.length === 0 || searchStart >= searchEnd) {
      return -1;
    }

    // Only last element to check
    if (searchStart === searchEnd - 1) {
      return PageBlobHandler.positionInRange(ranges[searchStart], position) ||
        position > ranges[searchStart].end
        ? searchStart
        : -1;
    }

    // 2 or more elements left
    const searchMid = Math.floor((searchStart + searchEnd) / 2);
    const indexInRight = PageBlobHandler.locateLastImpactedRange(
      ranges,
      searchMid + 1, // Remove searchMid range from searching scope
      searchEnd,
      position
    );
    if (indexInRight > -1) {
      return indexInRight;
    }
    if (
      PageBlobHandler.positionInRange(ranges[searchMid], position) ||
      position > ranges[searchMid].end
    ) {
      return searchMid;
    } else {
      return PageBlobHandler.locateLastImpactedRange(
        ranges,
        searchStart,
        searchMid,
        position
      );
    }
  }

  private static positionInRange(
    range: PersistencyPageRange,
    position: number
  ): boolean {
    return position >= range.start && position <= range.end;
  }
}
