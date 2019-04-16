import uuid from "uuid/v4";

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
  /**
   * Update Blob lease Attributes according to the current time.
   * The Attribute not set back
   *
   * @private
   * @param {BlobModel} blob
   * @param {Date} currentTime
   * @returns {BlobModel}
   * @memberof BlobHandler
   */
  public static updateLeaseAttributes(
    blob: BlobModel,
    currentTime: Date
  ): BlobModel {
    // check Leased -> Expired
    if (
      blob.properties.leaseState === Models.LeaseStateType.Leased &&
      blob.properties.leaseDuration === Models.LeaseDurationType.Fixed
    ) {
      if (
        blob.leaseExpireTime !== undefined &&
        currentTime > blob.leaseExpireTime
      ) {
        blob.properties.leaseState = Models.LeaseStateType.Expired;
        blob.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
        blob.properties.leaseDuration = undefined;
        blob.leaseExpireTime = undefined;
        blob.leaseBreakExpireTime = undefined;
      }
    }

    // check Breaking -> Broken
    if (blob.properties.leaseState === Models.LeaseStateType.Breaking) {
      if (
        blob.leaseBreakExpireTime !== undefined &&
        currentTime > blob.leaseBreakExpireTime
      ) {
        blob.properties.leaseState = Models.LeaseStateType.Broken;
        blob.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
        blob.properties.leaseDuration = undefined;
        blob.leaseExpireTime = undefined;
        blob.leaseBreakExpireTime = undefined;
      }
    }
    return blob;
  }

  /**
   * Check Blob lease status on write blob.
   *
   * Need run the funtion on: PutBlob, SetBlobMetadata, SetBlobProperties,
   * DeleteBlob, PutBlock, PutBlockList, PutPage, AppendBlock, CopyBlob(dest)
   *
   * @private
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {LeaseAccessConditions} leaseAccessConditions
   * @returns {void}
   * @memberof BlobHandler
   */
  public static checkBlobLeaseOnWriteBlob(
    context: Context,
    blob: BlobModel,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): void {
    // check Leased -> Expired

    if (blob.properties.leaseStatus === Models.LeaseStatusType.Locked) {
      if (
        leaseAccessConditions === undefined ||
        leaseAccessConditions.leaseId === undefined ||
        leaseAccessConditions.leaseId === null
      ) {
        const blobCtx = new BlobStorageContext(context);
        throw StorageErrorFactory.getBlobLeaseIdMissing(blobCtx.contextID!);
      } else if (
        blob.leaseId !== undefined &&
        leaseAccessConditions.leaseId.toLowerCase() !==
          blob.leaseId.toLowerCase()
      ) {
        const blobCtx = new BlobStorageContext(context);
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithBlobOperation(
          blobCtx.contextID!
        );
      }
    } else if (
      leaseAccessConditions !== undefined &&
      leaseAccessConditions.leaseId !== undefined &&
      leaseAccessConditions.leaseId !== ""
    ) {
      const blobCtx = new BlobStorageContext(context);
      throw StorageErrorFactory.getBlobLeaseLost(blobCtx.contextID!);
    }
  }

  /**
   * Update lease Expire Blob lease status to Available on write blob.
   *
   * Need run the funtion on: PutBlob, SetBlobMetadata, SetBlobProperties,
   * DeleteBlob, PutBlock, PutBlockList, PutPage, AppendBlock, CopyBlob(dest)
   *
   * @private
   * @param {BlobModel} blob
   * @returns {BlobModel}
   * @memberof BlobHandler
   */
  public static UpdateBlobLeaseStateOnWriteBlob(blob: BlobModel): BlobModel {
    if (blob.properties.leaseState === Models.LeaseStateType.Expired) {
      blob.properties.leaseState = Models.LeaseStateType.Available;
      blob.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
      blob.properties.leaseDuration = undefined;
      blob.leaseduration = undefined;
      blob.leaseId = undefined;
      blob.leaseExpireTime = undefined;
      blob.leaseBreakExpireTime = undefined;
    }
    return blob;
  }

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

    // Check Lease status
    BlobHandler.checkBlobLeaseOnWriteBlob(
      context,
      blob,
      options.leaseAccessConditions
    );

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
    const blobProps = blob.properties;

    // as per https://docs.microsoft.com/en-us/rest/api/storageservices/set-blob-properties#remarks
    // If any one or more of the following properties is set in the request,
    // then all of these properties are set together.
    // If a value is not provided for a given property when at least one
    // of the properties listed below is set, then that property will
    // be cleared for the blob.
    if (blobHeaders !== undefined) {
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
    let blob = await this.getSimpleBlobFromStorage(context);

    // Check Lease status
    BlobHandler.checkBlobLeaseOnWriteBlob(
      context,
      blob,
      options.leaseAccessConditions
    );

    blob.metadata = options.metadata;

    // Set lease to available if it's expired
    blob = BlobHandler.UpdateBlobLeaseStateOnWriteBlob(blob);
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
    const blobCtx = new BlobStorageContext(context);
    let blob: BlobModel;

    try {
      blob = await this.getSimpleBlobFromStorage(context);
    } catch (error) {
      throw error;
    }

    // check the lease action aligned with current lease state.
    if (blob.snapshot !== "") {
      throw StorageErrorFactory.getBlobLeaseOnSnapshot(blobCtx.contextID!);
    }
    if (blob.properties.leaseState === Models.LeaseStateType.Breaking) {
      throw StorageErrorFactory.getLeaseAlreadyPresent(context.contextID!);
    }
    if (
      blob.properties.leaseState === Models.LeaseStateType.Leased &&
      options.proposedLeaseId !== blob.leaseId
    ) {
      throw StorageErrorFactory.getLeaseAlreadyPresent(context.contextID!);
    }

    // update the lease information
    if (options.duration === -1 || options.duration === undefined) {
      blob.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    } else {
      // verify options.duration between 15 and 60
      if (options.duration > 60 || options.duration < 15) {
        throw StorageErrorFactory.getInvalidLeaseDuration(context.contextID!);
      }
      blob.properties.leaseDuration = Models.LeaseDurationType.Fixed;
      blob.leaseExpireTime = blobCtx.startTime!;
      blob.leaseExpireTime.setSeconds(
        blob.leaseExpireTime.getSeconds() + options.duration
      );
      blob.leaseduration = options.duration;
    }
    blob.properties.leaseState = Models.LeaseStateType.Leased;
    blob.properties.leaseStatus = Models.LeaseStatusType.Locked;
    blob.leaseId =
      options.proposedLeaseId !== "" && options.proposedLeaseId !== undefined
        ? options.proposedLeaseId
        : uuid();
    blob.leaseBreakExpireTime = undefined;

    await this.dataStore.updateBlob(blob);

    const response: Models.BlobAcquireLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: blob.properties.etag,
      lastModified: blob.properties.lastModified,
      leaseId: blob.leaseId,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 201
    };

    return response;
  }

  public async releaseLease(
    leaseId: string,
    options: Models.BlobReleaseLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobReleaseLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    let blob: BlobModel;

    try {
      blob = await this.getSimpleBlobFromStorage(context);
    } catch (error) {
      throw error;
    }

    // check the lease action aligned with current lease state.
    if (blob.snapshot !== "") {
      throw StorageErrorFactory.getBlobLeaseOnSnapshot(blobCtx.contextID!);
    }
    if (blob.properties.leaseState === Models.LeaseStateType.Available) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // Check lease ID
    if (blob.leaseId !== leaseId) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // update the lease information
    blob.properties.leaseState = Models.LeaseStateType.Available;
    blob.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
    blob.properties.leaseDuration = undefined;
    blob.leaseduration = undefined;
    blob.leaseId = undefined;
    blob.leaseExpireTime = undefined;
    blob.leaseBreakExpireTime = undefined;

    await this.dataStore.updateBlob(blob);

    const response: Models.BlobReleaseLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: blob.properties.etag,
      lastModified: blob.properties.lastModified,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    return response;
  }

  public async renewLease(
    leaseId: string,
    options: Models.BlobRenewLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobRenewLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    let blob: BlobModel;

    try {
      blob = await this.getSimpleBlobFromStorage(context);
    } catch (error) {
      throw error;
    }

    // check the lease action aligned with current lease state.
    if (blob.snapshot !== "") {
      throw StorageErrorFactory.getBlobLeaseOnSnapshot(blobCtx.contextID!);
    }
    if (blob.properties.leaseState === Models.LeaseStateType.Available) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }
    if (
      blob.properties.leaseState === Models.LeaseStateType.Breaking ||
      blob.properties.leaseState === Models.LeaseStateType.Broken
    ) {
      throw StorageErrorFactory.getLeaseIsBrokenAndCannotBeRenewed(
        blobCtx.contextID!
      );
    }

    // Check lease ID
    if (blob.leaseId !== leaseId) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // update the lease information
    blob.properties.leaseState = Models.LeaseStateType.Leased;
    blob.properties.leaseStatus = Models.LeaseStatusType.Locked;
    // when container.leaseduration has value (not -1), means fixed duration
    if (blob.leaseduration !== undefined && blob.leaseduration !== -1) {
      blob.leaseExpireTime = blobCtx.startTime!;
      blob.leaseExpireTime.setSeconds(
        blob.leaseExpireTime.getSeconds() + blob.leaseduration
      );
      blob.properties.leaseDuration = Models.LeaseDurationType.Fixed;
    } else {
      blob.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    }
    await this.dataStore.updateContainer(blob);

    const response: Models.BlobRenewLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: blob.properties.etag,
      lastModified: blob.properties.lastModified,
      leaseId: blob.leaseId,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    return response;
  }

  public async changeLease(
    leaseId: string,
    proposedLeaseId: string,
    options: Models.BlobChangeLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobChangeLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    let blob: BlobModel;

    try {
      blob = await this.getSimpleBlobFromStorage(context);
    } catch (error) {
      throw error;
    }

    // check the lease action aligned with current lease state.
    if (blob.snapshot !== "") {
      throw StorageErrorFactory.getBlobLeaseOnSnapshot(blobCtx.contextID!);
    }
    if (
      blob.properties.leaseState === Models.LeaseStateType.Available ||
      blob.properties.leaseState === Models.LeaseStateType.Expired ||
      blob.properties.leaseState === Models.LeaseStateType.Broken
    ) {
      throw StorageErrorFactory.getBlobLeaseNotPresentWithLeaseOperation(
        blobCtx.contextID!
      );
    }
    if (blob.properties.leaseState === Models.LeaseStateType.Breaking) {
      throw StorageErrorFactory.getLeaseIsBreakingAndCannotBeChanged(
        blobCtx.contextID!
      );
    }

    // Check lease ID
    if (blob.leaseId !== leaseId && blob.leaseId !== proposedLeaseId) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // update the lease information, only need update lease ID
    blob.leaseId = proposedLeaseId;

    await this.dataStore.updateBlob(blob);

    const response: Models.BlobChangeLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: blob.properties.etag,
      lastModified: blob.properties.lastModified,
      leaseId: blob.leaseId,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    return response;
  }

  public async breakLease(
    options: Models.BlobBreakLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobBreakLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    let blob: BlobModel;
    let leaseTimeinSecond: number;
    leaseTimeinSecond = 0;

    try {
      blob = await this.getSimpleBlobFromStorage(context);
    } catch (error) {
      throw error;
    }

    // check the lease action aligned with current lease state.
    if (blob.snapshot !== "") {
      throw StorageErrorFactory.getBlobLeaseOnSnapshot(blobCtx.contextID!);
    }
    if (blob.properties.leaseState === Models.LeaseStateType.Available) {
      throw StorageErrorFactory.getBlobLeaseNotPresentWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // update the lease information
    // verify options.breakPeriod between 0 and 60
    if (
      options.breakPeriod !== undefined &&
      (options.breakPeriod > 60 || options.breakPeriod < 0)
    ) {
      throw StorageErrorFactory.getInvalidLeaseBreakPeriod(blobCtx.contextID!);
    }
    if (
      blob.properties.leaseState === Models.LeaseStateType.Expired ||
      blob.properties.leaseState === Models.LeaseStateType.Broken ||
      options.breakPeriod === 0 ||
      options.breakPeriod === undefined
    ) {
      blob.properties.leaseState = Models.LeaseStateType.Broken;
      blob.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
      blob.properties.leaseDuration = undefined;
      blob.leaseduration = undefined;
      blob.leaseExpireTime = undefined;
      blob.leaseBreakExpireTime = undefined;
      leaseTimeinSecond = 0;
    } else {
      blob.properties.leaseState = Models.LeaseStateType.Breaking;
      blob.properties.leaseStatus = Models.LeaseStatusType.Locked;
      blob.leaseduration = undefined;
      if (blob.properties.leaseDuration === Models.LeaseDurationType.Infinite) {
        blob.properties.leaseDuration = undefined;
        blob.leaseExpireTime = undefined;
        blob.leaseBreakExpireTime = new Date(blobCtx.startTime!);
        blob.leaseBreakExpireTime.setSeconds(
          blob.leaseBreakExpireTime.getSeconds() + options.breakPeriod
        );
        leaseTimeinSecond = options.breakPeriod;
      } else {
        let newleaseBreakExpireTime = new Date(blobCtx.startTime!);
        newleaseBreakExpireTime.setSeconds(
          newleaseBreakExpireTime.getSeconds() + options.breakPeriod
        );
        if (
          blob.leaseExpireTime !== undefined &&
          newleaseBreakExpireTime > blob.leaseExpireTime
        ) {
          newleaseBreakExpireTime = blob.leaseExpireTime;
        }
        if (
          blob.leaseBreakExpireTime === undefined ||
          blob.leaseBreakExpireTime > newleaseBreakExpireTime
        ) {
          blob.leaseBreakExpireTime = newleaseBreakExpireTime;
        }
        leaseTimeinSecond = Math.round(
          Math.abs(
            blob.leaseBreakExpireTime.getTime() - blobCtx.startTime!.getTime()
          ) / 1000
        );
        blob.leaseExpireTime = undefined;
        blob.properties.leaseDuration = undefined;
      }
    }

    await this.dataStore.updateBlob(blob);

    const response: Models.BlobBreakLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: blob.properties.etag,
      lastModified: blob.properties.lastModified,
      leaseTime: leaseTimeinSecond,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 202
    };

    return response;
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
    // TODO: Check dest Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
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

  public async getAccountInfoWithHead(
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

    let blob = await this.dataStore.getBlob(
      accountName,
      containerName,
      blobName
    );
    if (!blob) {
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }

    blob = BlobHandler.updateLeaseAttributes(blob, blobCtx.startTime!);

    return blob;
  }
}
