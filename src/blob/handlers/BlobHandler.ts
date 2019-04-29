import { URL } from "url";
import uuid from "uuid/v4";

import BlobStorageContext from "../context/BlobStorageContext";
import { extractStoragePartsFromPath } from "../context/blobStorageContext.middleware";
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
  deserializeRangeHeader,
  getContainerGetAccountInfoResponse,
  newEtag
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
        leaseAccessConditions.leaseId === ""
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
    if (
      blob.properties.leaseState === Models.LeaseStateType.Expired ||
      blob.properties.leaseState === Models.LeaseStateType.Broken
    ) {
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

  /**
   * Check Blob lease status on Read blob.
   *
   * @private
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {LeaseAccessConditions} leaseAccessConditions
   * @returns {void}
   * @memberof BlobHandler
   */
  public static checkLeaseOnReadBlob(
    context: Context,
    blob: BlobModel,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): void {
    // check only when input Leased Id is not empty
    if (
      leaseAccessConditions !== undefined &&
      leaseAccessConditions.leaseId !== undefined &&
      leaseAccessConditions.leaseId !== ""
    ) {
      // return error when lease is unlocked
      if (blob.properties.leaseStatus === Models.LeaseStatusType.Unlocked) {
        const blobCtx = new BlobStorageContext(context);
        throw StorageErrorFactory.getBlobLeaseLost(blobCtx.contextID!);
      } else if (
        blob.leaseId !== undefined &&
        leaseAccessConditions.leaseId.toLowerCase() !==
          blob.leaseId.toLowerCase()
      ) {
        // return error when lease is locked but lease ID not match
        const blobCtx = new BlobStorageContext(context);
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithBlobOperation(
          blobCtx.contextID!
        );
      }
    }
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
    const blob = await this.getSimpleBlobFromStorage(context, options.snapshot);

    if (blob.snapshot === "") {
      BlobHandler.checkLeaseOnReadBlob(
        context,
        blob,
        options.leaseAccessConditions
      );
    }

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
    const blob = await this.getSimpleBlobFromStorage(context, options.snapshot);

    // TODO: Lease for a snapshot blob?
    if (blob.snapshot === "") {
      BlobHandler.checkLeaseOnReadBlob(
        context,
        blob,
        options.leaseAccessConditions
      );
    }

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
   * Delete blob or snapshots.
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
    const blob = await this.getSimpleBlobFromStorage(context, options.snapshot);
    const againstBaseBlob = blob.snapshot === "";

    // Check Lease status
    if (againstBaseBlob) {
      BlobHandler.checkBlobLeaseOnWriteBlob(
        context,
        blob,
        options.leaseAccessConditions
      );
    }

    // Check bad requests
    if (!againstBaseBlob && options.deleteSnapshots !== undefined) {
      throw StorageErrorFactory.getInvalidOperation(
        context.contextID!,
        "Invalid operation against a blob snapshot."
      );
    }

    // Check whether blob has snapshots
    const blobAndSnapshots = [];
    let marker;
    let blobs = [];
    do {
      [blobs, marker] = await this.dataStore.listBlobs(
        blob.accountName,
        blob.containerName,
        blob.name,
        undefined,
        5000,
        marker,
        true
      );
      blobAndSnapshots.push(...blobs);
    } while (marker !== undefined);

    const hasSnapshots = blobAndSnapshots.length > 1;

    // Scenario: Delete base blob only
    if (againstBaseBlob && options.deleteSnapshots === undefined) {
      if (hasSnapshots) {
        throw StorageErrorFactory.getSnapshotsPresent(context.contextID!);
      } else {
        await this.dataStore.deleteBlob(
          blob.accountName,
          blob.containerName,
          blob.name
        );
      }
    }

    // Scenario: Delete snapshot only
    if (!againstBaseBlob) {
      await this.dataStore.deleteBlob(
        blob.accountName,
        blob.containerName,
        blob.name,
        blob.snapshot
      );
    }

    // Scenario: Delete base blob and snapshots
    if (
      againstBaseBlob &&
      options.deleteSnapshots === Models.DeleteSnapshotsOptionType.Include
    ) {
      const promises = [];
      for (const item of blobAndSnapshots) {
        promises.push(
          this.dataStore.deleteBlob(
            item.accountName,
            item.containerName,
            item.name,
            item.snapshot
          )
        );
      }
      await Promise.all(promises);
    }

    // Scenario: Delete snapshots only
    if (
      againstBaseBlob &&
      options.deleteSnapshots === Models.DeleteSnapshotsOptionType.Only
    ) {
      const promises = [];
      for (const item of blobAndSnapshots.filter(value => {
        return value.snapshot !== "";
      })) {
        promises.push(
          this.dataStore.deleteBlob(
            item.accountName,
            item.containerName,
            item.name,
            item.snapshot
          )
        );
      }
      await Promise.all(promises);
    }

    const response: Models.BlobDeleteResponse = {
      statusCode: 202,
      requestId: context.contextID,
      date: context.startTime,
      version: API_VERSION
    };

    return response;
  }

  /**
   * Undelete blob
   *
   * @param {Models.BlobUndeleteOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobUndeleteResponse>}
   * @memberof BlobHandler
   */
  public async undelete(
    options: Models.BlobUndeleteOptionalParams,
    context: Context
  ): Promise<Models.BlobUndeleteResponse> {
    throw new NotImplementedError(context.contextID);
  }

  /**
   * Set HTTP Headers
   * see also https://docs.microsoft.com/en-us/rest/api/storageservices/set-blob-properties
   *
   * @param {Models.BlobSetHTTPHeadersOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobSetHTTPHeadersResponse>}
   * @memberof BlobHandler
   */
  public async setHTTPHeaders(
    options: Models.BlobSetHTTPHeadersOptionalParams,
    context: Context
  ): Promise<Models.BlobSetHTTPHeadersResponse> {
    let blob = await this.getSimpleBlobFromStorage(context);

    // Check Lease status
    BlobHandler.checkBlobLeaseOnWriteBlob(
      context,
      blob,
      options.leaseAccessConditions
    );

    // Set lease to available if it's expired
    blob = BlobHandler.UpdateBlobLeaseStateOnWriteBlob(blob);
    await this.dataStore.updateBlob(blob);

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

  /**
   * Set Metadata
   *
   * @param {Models.BlobSetMetadataOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobSetMetadataResponse>}
   * @memberof BlobHandler
   */
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

  /**
   * Acquire Blob Lease
   *
   * @param {Models.BlobAcquireLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobAcquireLeaseResponse>}
   * @memberof BlobHandler
   */
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
      throw StorageErrorFactory.getBlobSnapshotsPresent(blobCtx.contextID!);
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

  /**
   * release blob lease
   *
   * @param {string} leaseId
   * @param {Models.BlobReleaseLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobReleaseLeaseResponse>}
   * @memberof BlobHandler
   */
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
      throw StorageErrorFactory.getBlobSnapshotsPresent(blobCtx.contextID!);
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

  /**
   * Renew blob lease
   *
   * @param {string} leaseId
   * @param {Models.BlobRenewLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobRenewLeaseResponse>}
   * @memberof BlobHandler
   */
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
      throw StorageErrorFactory.getBlobSnapshotsPresent(blobCtx.contextID!);
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

  /**
   * Change lease.
   *
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Models.BlobChangeLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobChangeLeaseResponse>}
   * @memberof BlobHandler
   */
  public async changeLease(
    leaseId: string,
    proposedLeaseId: string,
    options: Models.BlobChangeLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobChangeLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    let blob: BlobModel;

    blob = await this.getSimpleBlobFromStorage(context);

    // check the lease action aligned with current lease state.
    if (blob.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(blobCtx.contextID!);
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

  /**
   * Break lease.
   *
   * @param {Models.BlobBreakLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobBreakLeaseResponse>}
   * @memberof BlobHandler
   */
  public async breakLease(
    options: Models.BlobBreakLeaseOptionalParams,
    context: Context
  ): Promise<Models.BlobBreakLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    let blob: BlobModel;
    let leaseTimeinSecond: number;
    leaseTimeinSecond = 0;

    blob = await this.getSimpleBlobFromStorage(context);

    // check the lease action aligned with current lease state.
    if (blob.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(blobCtx.contextID!);
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

  /**
   * Create snapshot.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/snapshot-blob
   *
   * @param {Models.BlobCreateSnapshotOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobCreateSnapshotResponse>}
   * @memberof BlobHandler
   */
  public async createSnapshot(
    options: Models.BlobCreateSnapshotOptionalParams,
    context: Context
  ): Promise<Models.BlobCreateSnapshotResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);

    // Deep clone blob model to snapshot blob model.
    // TODO: Create a method for deep object copy
    const snapshotBlob: BlobModel = {
      name: blob.name,
      deleted: false,
      snapshot: context.startTime!.toISOString(),
      properties: { ...blob.properties },
      metadata: { ...blob.metadata },
      accountName: blob.accountName,
      containerName: blob.containerName,
      pageRangesInOrder:
        blob.pageRangesInOrder === undefined
          ? undefined
          : blob.pageRangesInOrder.slice(),
      isCommitted: blob.isCommitted,
      leaseduration: blob.leaseduration,
      leaseId: blob.leaseId,
      leaseExpireTime: blob.leaseExpireTime,
      leaseBreakExpireTime: blob.leaseBreakExpireTime,
      committedBlocksInOrder:
        blob.committedBlocksInOrder === undefined
          ? undefined
          : blob.committedBlocksInOrder.slice(),
      persistency:
        blob.persistency === undefined ? undefined : { ...blob.persistency }
    };

    await this.dataStore.updateBlob(snapshotBlob);

    const response: Models.BlobCreateSnapshotResponse = {
      statusCode: 201,
      eTag: snapshotBlob.properties.etag,
      lastModified: snapshotBlob.properties.lastModified,
      requestId: context.contextID,
      date: context.startTime!,
      version: API_VERSION,
      snapshot: snapshotBlob.snapshot
    };

    return response;
  }

  /**
   * start copy from Url
   *
   * @param {string} copySource
   * @param {Models.BlobStartCopyFromURLOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobStartCopyFromURLResponse>}
   * @memberof BlobHandler
   */
  public async startCopyFromURL(
    copySource: string,
    options: Models.BlobStartCopyFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlobStartCopyFromURLResponse> {
    const blobContext = new BlobStorageContext(context);

    // TODO: Check dest Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const url = new URL(copySource);
    const [
      sourceAccount,
      sourceContainer,
      sourceBlob
    ] = extractStoragePartsFromPath(url.pathname);
    const snapshot = url.searchParams.get("snapshot") || "";

    if (
      sourceAccount !== blobContext.account ||
      sourceAccount === undefined ||
      sourceContainer === undefined ||
      sourceBlob === undefined
    ) {
      throw new NotImplementedError(context.contextID);
    }

    // TODO: Only supports copy from devstoreaccount1, not a complete copy implementation
    // Extract source account name, container name, blob name and snapshot
    // If within devstoreaccount1
    const sourceContainerModel = await this.dataStore.getContainer(
      sourceAccount,
      sourceContainer
    );
    if (sourceContainerModel === undefined) {
      // TODO: Check error message
      throw StorageErrorFactory.getInvalidOperation(
        context.contextID!,
        "Source container doesn't exist."
      );
    }

    // Get source storage blob model
    const sourceBlobModel = await this.dataStore.getBlob(
      sourceAccount,
      sourceContainer,
      sourceBlob,
      snapshot
    );

    // If source is uncommitted or deleted
    if (
      sourceBlobModel === undefined ||
      sourceBlobModel.deleted ||
      !sourceBlobModel.isCommitted
    ) {
      // TODO: Check error message
      throw StorageErrorFactory.getInvalidOperation(
        context.contextID!,
        "Source blob doesn't exist."
      );
    }

    const destContainerModel = await this.dataStore.getContainer(
      blobContext.account!,
      blobContext.container!
    );
    if (destContainerModel === undefined) {
      throw StorageErrorFactory.getContainerNotFound(blobContext.contextID!);
    }

    // Deep clone a copied blob
    const copiedBlob: BlobModel = {
      name: blobContext.blob!,
      deleted: false,
      snapshot: "",
      properties: {
        ...sourceBlobModel.properties,
        creationTime: context.startTime!,
        lastModified: context.startTime!,
        etag: newEtag(),
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        leaseDuration: undefined,
        copyId: uuid(),
        copyStatus: Models.CopyStatusType.Success,
        copySource,
        copyProgress: sourceBlobModel.properties.contentLength
          ? `${sourceBlobModel.properties.contentLength}/${
              sourceBlobModel.properties.contentLength
            }`
          : undefined,
        copyCompletionTime: context.startTime,
        copyStatusDescription: undefined,
        incrementalCopy: false,
        destinationSnapshot: undefined,
        deletedTime: undefined,
        remainingRetentionDays: undefined,
        archiveStatus: undefined,
        accessTierChangeTime: undefined
      },
      metadata:
        options.metadata === undefined
          ? { ...sourceBlobModel.metadata }
          : options.metadata,
      accountName: blobContext.account!,
      containerName: blobContext.container!,
      pageRangesInOrder: sourceBlobModel.pageRangesInOrder,
      isCommitted: sourceBlobModel.isCommitted,
      leaseduration: undefined,
      leaseId: undefined,
      leaseExpireTime: undefined,
      leaseBreakExpireTime: undefined,
      committedBlocksInOrder: sourceBlobModel.committedBlocksInOrder,
      persistency: sourceBlobModel.persistency
    };

    await this.dataStore.updateBlob(copiedBlob);

    const response: Models.BlobStartCopyFromURLResponse = {
      statusCode: 202,
      eTag: copiedBlob.properties.etag,
      lastModified: copiedBlob.properties.lastModified,
      requestId: context.contextID,
      version: API_VERSION,
      date: context.startTime,
      copyId: copiedBlob.properties.copyId,
      copyStatus: copiedBlob.properties.copyStatus
    };

    return response;
  }

  /**
   * abort copy from Url
   *
   * @param {string} copyId
   * @param {Models.BlobAbortCopyFromURLOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobAbortCopyFromURLResponse>}
   * @memberof BlobHandler
   */
  public async abortCopyFromURL(
    copyId: string,
    options: Models.BlobAbortCopyFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlobAbortCopyFromURLResponse> {
    const blob = await this.getSimpleBlobFromStorage(context);

    if (blob.properties.copyId !== copyId) {
      throw StorageErrorFactory.getCopyIdMismatch(context.contextID!);
    }

    if (blob.properties.copyStatus === Models.CopyStatusType.Success) {
      throw StorageErrorFactory.getNoPendingCopyOperation(context.contextID!);
    }

    const response: Models.BlobAbortCopyFromURLResponse = {
      statusCode: 204,
      requestId: context.contextID,
      version: API_VERSION,
      date: context.startTime
    };

    return response;
  }

  /**
   * set blob tier
   *
   * @param {Models.AccessTier} tier
   * @param {Models.BlobSetTierOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobSetTierResponse>}
   * @memberof BlobHandler
   */
  public async setTier(
    tier: Models.AccessTier,
    options: Models.BlobSetTierOptionalParams,
    context: Context
  ): Promise<Models.BlobSetTierResponse> {
    const blobCtx = new BlobStorageContext(context);
    let blob: BlobModel;

    blob = await this.getSimpleBlobFromStorage(context);

    // check the lease action aligned with current lease state.
    // the API has not lease ID input, but run it on a lease blocked blob will fail with LeaseIdMissing,
    // this is aliged with server behavior
    BlobHandler.checkBlobLeaseOnWriteBlob(context, blob, undefined);

    // Check Blob is not snapshot
    if (blob.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(blobCtx.contextID!);
    }

    const response: Models.BlobSetTierResponse = {
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    // Check BlobTier matches blob type
    if (
      (tier === Models.AccessTier.Archive ||
        tier === Models.AccessTier.Cool ||
        tier === Models.AccessTier.Hot) &&
      blob.properties.blobType === Models.BlobType.BlockBlob
    ) {
      // Block blob
      // tslint:disable-next-line:max-line-length
      // TODO: check blob is not block blob with snapshot, throw StorageErrorFactory.getBlobSnapshotsPresent_hassnapshot()

      // Archive -> Coo/Hot will return 202
      if (
        blob.properties.accessTier === Models.AccessTier.Archive &&
        (tier === Models.AccessTier.Cool || tier === Models.AccessTier.Hot)
      ) {
        response.statusCode = 202;
      }

      blob.properties.accessTier = tier;
      blob.properties.accessTierChangeTime = context.startTime;
    } else if (
      tier
        .toString()
        .toUpperCase()
        .startsWith("P") &&
      blob.properties.blobType === Models.BlobType.PageBlob
    ) {
      // page blob
      // Check Page blob tier not set to lower
      if (blob.properties.accessTier !== undefined) {
        const oldTierInt = parseInt(
          blob.properties.accessTier.toString().substring(1),
          10
        );
        const newTierInt = parseInt(tier.toString().substring(1), 10);
        if (oldTierInt > newTierInt) {
          throw StorageErrorFactory.getBlobCannotChangeToLowerTier(
            blobCtx.contextID!
          );
        }
      }

      const oneGBinByte = 1024 * 1024 * 1024;
      // Check Blob size match tier
      if (
        (tier === Models.AccessTier.P4 &&
          blob.properties.contentLength! > 32 * oneGBinByte) ||
        (tier === Models.AccessTier.P6 &&
          blob.properties.contentLength! > 64 * oneGBinByte) ||
        (tier === Models.AccessTier.P10 &&
          blob.properties.contentLength! > 128 * oneGBinByte) ||
        // (tier === Models.AccessTier.P15 &&
        //   blob.properties.contentLength! > 256 * oneGBinByte) ||
        (tier === Models.AccessTier.P20 &&
          blob.properties.contentLength! > 512 * oneGBinByte) ||
        (tier === Models.AccessTier.P30 &&
          blob.properties.contentLength! > 1024 * oneGBinByte) ||
        (tier === Models.AccessTier.P40 &&
          blob.properties.contentLength! > 2048 * oneGBinByte) ||
        (tier === Models.AccessTier.P50 &&
          blob.properties.contentLength! > 4095 * oneGBinByte)
        // (tier === Models.AccessTier.P60 &&
        //   blob.properties.contentLength! > 64 * oneGBinByte) ||
        // (tier === Models.AccessTier.P70 &&
        //   blob.properties.contentLength! > 64 * oneGBinByte) ||
        // (tier === Models.AccessTier.P80 &&
        //   blob.properties.contentLength! > 64 * oneGBinByte)
      ) {
        throw StorageErrorFactory.getBlobBlobTierInadequateForContentLength(
          blobCtx.contextID!
        );
      }

      blob.properties.accessTier = tier;
      blob.properties.accessTierChangeTime = context.startTime;
    } else {
      // Blob tier and blob type not match
      throw StorageErrorFactory.getBlobInvalidBlobType(blobCtx.contextID!);
    }

    await this.dataStore.updateBlob(blob);

    return response;
  }

  /**
   * get account info
   *
   * @param {Context} context
   * @returns {Promise<Models.BlobGetAccountInfoResponse>}
   * @memberof BlobHandler
   */
  public async getAccountInfo(
    context: Context
  ): Promise<Models.BlobGetAccountInfoResponse> {
    return getContainerGetAccountInfoResponse(context);
  }

  /**
   * get account info with headers
   *
   * @param {Context} context
   * @returns {Promise<Models.BlobGetAccountInfoResponse>}
   * @memberof BlobHandler
   */
  public async getAccountInfoWithHead(
    context: Context
  ): Promise<Models.BlobGetAccountInfoResponse> {
    return getContainerGetAccountInfoResponse(context);
  }

  /**
   * download block blob
   *
   * @private
   * @param {Models.BlobDownloadOptionalParams} options
   * @param {Context} context
   * @param {BlobModel} blob
   * @returns {Promise<Models.BlobDownloadResponse>}
   * @memberof BlobHandler
   */
  private async downloadBlockBlob(
    options: Models.BlobDownloadOptionalParams,
    context: Context,
    blob: BlobModel
  ): Promise<Models.BlobDownloadResponse> {
    if (blob.snapshot === "") {
      BlobHandler.checkLeaseOnReadBlob(
        context,
        blob,
        options.leaseAccessConditions
      );
    }

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

  /**
   * download page blob
   *
   * @private
   * @param {Models.BlobDownloadOptionalParams} options
   * @param {Context} context
   * @param {BlobModel} blob
   * @returns {Promise<Models.BlobDownloadResponse>}
   * @memberof BlobHandler
   */
  private async downloadPageBlob(
    options: Models.BlobDownloadOptionalParams,
    context: Context,
    blob: BlobModel
  ): Promise<Models.BlobDownloadResponse> {
    if (blob.snapshot === "") {
      BlobHandler.checkLeaseOnReadBlob(
        context,
        blob,
        options.leaseAccessConditions
      );
    }

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
      statusCode: rangesParts[1] === Infinity ? 200 : 206,
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
   * @param {string} [snapshot=""]
   * @returns {Promise<BlobModel>}
   * @memberof BlobHandler
   */
  private async getSimpleBlobFromStorage(
    context: Context,
    snapshot: string = ""
  ): Promise<BlobModel> {
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
      blobName,
      snapshot
    );
    if (!blob) {
      throw StorageErrorFactory.getBlobNotFound(blobCtx.contextID!);
    }

    blob = BlobHandler.updateLeaseAttributes(blob, blobCtx.startTime!);

    return blob;
  }
}
