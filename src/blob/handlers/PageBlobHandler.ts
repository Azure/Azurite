import IExtentStore from "../../common/persistence/IExtentStore";
import { convertRawHeadersToMetadata, newEtag } from "../../common/utils/utils";
import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IPageBlobHandler from "../generated/handlers/IPageBlobHandler";
import ILogger from "../generated/utils/ILogger";
import BlobLeaseAdapter from "../lease/BlobLeaseAdapter";
import BlobWriteLeaseValidator from "../lease/BlobWriteLeaseValidator";
import IBlobMetadataStore, {
  BlobModel
} from "../persistence/IBlobMetadataStore";
import { BLOB_API_VERSION } from "../utils/constants";
import { deserializePageBlobRangeHeader, getTagsFromString } from "../utils/utils";
import BaseHandler from "./BaseHandler";
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
    metadataStore: IBlobMetadataStore,
    extentStore: IExtentStore,
    logger: ILogger,
    loose: boolean,
    private readonly rangesManager: IPageBlobRangesManager
  ) {
    super(metadataStore, extentStore, logger, loose);
  }

  public async uploadPagesFromURL(
    sourceUrl: string,
    sourceRange: string,
    contentLength: number,
    range: string,
    options: Models.PageBlobUploadPagesFromURLOptionalParams,
    context: Context
  ): Promise<Models.PageBlobUploadPagesFromURLResponse> {
    throw new NotImplementedError(context.contextId);
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

    if (options.tier !== undefined) {
      throw StorageErrorFactory.getAccessTierNotSupportedForBlobType(
        context.contextId!
      );
    }

    if (contentLength !== 0) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextId!,
        "Content-Length must be 0 for Create Page Blob request."
      );
    }

    if (blobContentLength % 512 !== 0) {
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextId!,
        "x-ms-content-length must be aligned to a 512-byte boundary."
      );
    }

    options.blobHTTPHeaders = options.blobHTTPHeaders || {};
    const contentType =
      options.blobHTTPHeaders.blobContentType ||
      context.request!.getHeader("content-type") ||
      "application/octet-stream";

    // const accessTierInferred = options.pageBlobAccessTier === undefined;

    // Check Blob size match tier
    // if (
    //   !accessTierInferred &&
    //   blobContentLength > PageBlobAccessTierThreshold.get(tier)!
    // ) {
    //   throw StorageErrorFactory.getBlobBlobTierInadequateForContentLength(
    //     blobCtx.contextID!
    //   );
    // }

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders(), context.contextId!
    );

    const etag = newEtag();
    const blob: BlobModel = {
      deleted: false,
      metadata,
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
        blobSequenceNumber: options.blobSequenceNumber
          ? options.blobSequenceNumber
          : 0,
        blobType: Models.BlobType.PageBlob,
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        serverEncrypted: true
        // TODO: May support setting this part for a premium storage account.
        // accessTier: accessTierInferred
        //   ? ((options.pageBlobAccessTier as any) as Models.AccessTier)
        //   : Models.AccessTier.P4, // TODO: Infer tier from size
        // accessTierInferred
      },
      snapshot: "",
      isCommitted: true,
      pageRangesInOrder: [],      
      blobTags: options.blobTagsString === undefined ? undefined : getTagsFromString(options.blobTagsString, context.contextId!),
    };

    // TODO: What's happens when create page blob right before commit block list? Or should we lock
    // Should we check if there is an uncommitted blob?
    await this.metadataStore.createBlob(
      context,
      blob,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.PageBlobCreateResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: blob.properties.lastModified,
      contentMD5: blob.properties.contentMD5,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date,
      isServerEncrypted: true,
      clientRequestId: options.requestId
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
        blobCtx.contextId!,
        "content-length or x-ms-content-length must be aligned to a 512-byte boundary."
      );
    }

    const blob = await this.metadataStore.downloadBlob(
      context,
      accountName,
      containerName,
      blobName,
      undefined,
      options.leaseAccessConditions
    );

    if (blob.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getBlobInvalidBlobType(blobCtx.contextId!);
    }

    // Check Lease status
    new BlobWriteLeaseValidator(options.leaseAccessConditions).validate(
      new BlobLeaseAdapter(blob),
      context
    );

    let ranges;
    try {
      ranges = deserializePageBlobRangeHeader(
        blobCtx.request!.getHeader("range"),
        blobCtx.request!.getHeader("x-ms-range"),
        true
      );
    } catch (err) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextId!);
    }

    const start = ranges[0];
    const end = ranges[1]; // Inclusive
    if (end - start + 1 !== contentLength) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextId!);
    }

    // Start Range is bigger than blob length
    if (start >= blob.properties.contentLength!) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextId!);
    }

    const persistency = await this.extentStore.appendExtent(
      body,
      context.contextId
    );
    if (persistency.count !== contentLength) {
      // TODO: Confirm status code
      throw StorageErrorFactory.getInvalidOperation(
        blobCtx.contextId!,
        `The size of the request body ${persistency.count} mismatches the content-length ${contentLength}.`
      );
    }

    const res = await this.metadataStore.uploadPages(
      context,
      blob,
      start,
      end,
      persistency,
      options.leaseAccessConditions,
      options.modifiedAccessConditions,
      options.sequenceNumberAccessConditions
    );

    const response: Models.PageBlobUploadPagesResponse = {
      statusCode: 201,
      eTag: res.etag,
      lastModified: date,
      contentMD5: undefined, // TODO
      blobSequenceNumber: res.blobSequenceNumber,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      date,
      isServerEncrypted: true,
      clientRequestId: options.requestId
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
        blobCtx.contextId!,
        "content-length or x-ms-content-length must be 0 for clear pages operation."
      );
    }

    const blob = await this.metadataStore.downloadBlob(
      context,
      accountName,
      containerName,
      blobName,
      undefined,
      options.leaseAccessConditions
    );

    if (blob.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getBlobInvalidBlobType(blobCtx.contextId!);
    }

    let ranges;
    try {
      ranges = deserializePageBlobRangeHeader(
        blobCtx.request!.getHeader("range"),
        blobCtx.request!.getHeader("x-ms-range"),
        true
      );
    } catch (err) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextId!);
    }

    const start = ranges[0];
    const end = ranges[1];

    // Start Range is bigger than blob length
    if (start >= blob.properties.contentLength!) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextId!);
    }

    const res = await this.metadataStore.clearRange(
      context,
      blob,
      start,
      end,
      options.leaseAccessConditions,
      options.modifiedAccessConditions,
      options.sequenceNumberAccessConditions
    );

    const response: Models.PageBlobClearPagesResponse = {
      statusCode: 201,
      eTag: res.etag,
      lastModified: date,
      contentMD5: undefined, // TODO
      blobSequenceNumber: res.blobSequenceNumber,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      clientRequestId: options.requestId,
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

    const blob = await this.metadataStore.getPageRanges(
      context,
      accountName,
      containerName,
      blobName,
      options.snapshot,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    if (blob.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getBlobInvalidBlobType(blobCtx.contextId!);
    }

    let ranges = deserializePageBlobRangeHeader(
      blobCtx.request!.getHeader("range"),
      blobCtx.request!.getHeader("x-ms-range"),
      false
    );
    if (!ranges) {
      ranges = [0, blob.properties.contentLength! - 1];
    }

    // Start Range is bigger than blob length
    if (ranges[0] >= blob.properties.contentLength!) {
      throw StorageErrorFactory.getInvalidPageRange(blobCtx.contextId!);
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
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      clientRequestId: options.requestId,
      date
    };

    return response;
  }

  public async getPageRangesDiff(
    options: Models.PageBlobGetPageRangesDiffOptionalParams,
    context: Context
  ): Promise<Models.PageBlobGetPageRangesDiffResponse> {
    throw new NotImplementedError(context.contextId);
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
        blobCtx.contextId!,
        "x-ms-blob-content-length must be aligned to a 512-byte boundary for Page Blob Resize request."
      );
    }

    const res = await this.metadataStore.resizePageBlob(
      context,
      accountName,
      containerName,
      blobName,
      blobContentLength,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.PageBlobResizeResponse = {
      statusCode: 200,
      eTag: res.etag,
      lastModified: res.lastModified,
      blobSequenceNumber: res.blobSequenceNumber,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      clientRequestId: options.requestId,
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

    const res = await this.metadataStore.updateSequenceNumber(
      context,
      accountName,
      containerName,
      blobName,
      sequenceNumberAction,
      options.blobSequenceNumber,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.PageBlobUpdateSequenceNumberResponse = {
      statusCode: 200,
      eTag: res.etag,
      lastModified: res.lastModified,
      blobSequenceNumber: res.blobSequenceNumber,
      requestId: blobCtx.contextId,
      version: BLOB_API_VERSION,
      clientRequestId: options.requestId,
      date
    };

    return response;
  }

  public async copyIncremental(
    copySource: string,
    options: Models.PageBlobCopyIncrementalOptionalParams,
    context: Context
  ): Promise<Models.PageBlobCopyIncrementalResponse> {
    throw new NotImplementedError(context.contextId);
  }
}
