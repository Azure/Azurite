import { URL } from "url";

import IExtentStore from "../../common/persistence/IExtentStore";
import BlobStorageContext from "../context/BlobStorageContext";
import { extractStoragePartsFromPath } from "../context/blobStorageContext.middleware";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlobHandler from "../generated/handlers/IBlobHandler";
import ILogger from "../generated/utils/ILogger";
import IBlobMetadataStore, {
  BlobModel
} from "../persistence/IBlobMetadataStore";
import {
  BLOB_API_VERSION,
  EMULATOR_ACCOUNT_KIND,
  EMULATOR_ACCOUNT_SKUNAME
} from "../utils/constants";
import {
  deserializePageBlobRangeHeader,
  deserializeRangeHeader,
  getMD5FromStream
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
        blob.leaseBreakTime = undefined;
      }
    }

    // check Breaking -> Broken
    if (blob.properties.leaseState === Models.LeaseStateType.Breaking) {
      if (
        blob.leaseBreakTime !== undefined &&
        currentTime > blob.leaseBreakTime
      ) {
        blob.properties.leaseState = Models.LeaseStateType.Broken;
        blob.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
        blob.properties.leaseDuration = undefined;
        blob.leaseExpireTime = undefined;
        blob.leaseBreakTime = undefined;
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
        throw StorageErrorFactory.getBlobLeaseIdMissing(blobCtx.contextId!);
      } else if (
        blob.leaseId !== undefined &&
        leaseAccessConditions.leaseId.toLowerCase() !==
          blob.leaseId.toLowerCase()
      ) {
        const blobCtx = new BlobStorageContext(context);
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithBlobOperation(
          blobCtx.contextId!
        );
      }
    } else if (
      leaseAccessConditions !== undefined &&
      leaseAccessConditions.leaseId !== undefined &&
      leaseAccessConditions.leaseId !== ""
    ) {
      const blobCtx = new BlobStorageContext(context);
      throw StorageErrorFactory.getBlobLeaseLost(blobCtx.contextId!);
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
      blob.leaseDurationSeconds = undefined;
      blob.leaseId = undefined;
      blob.leaseExpireTime = undefined;
      blob.leaseBreakTime = undefined;
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
        throw StorageErrorFactory.getBlobLeaseLost(blobCtx.contextId!);
      } else if (
        blob.leaseId !== undefined &&
        leaseAccessConditions.leaseId.toLowerCase() !==
          blob.leaseId.toLowerCase()
      ) {
        // return error when lease is locked but lease ID not match
        const blobCtx = new BlobStorageContext(context);
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithBlobOperation(
          blobCtx.contextId!
        );
      }
    }
  }

  constructor(
    metadataStore: IBlobMetadataStore,
    extentStore: IExtentStore,
    logger: ILogger,
    private readonly rangesManager: IPageBlobRangesManager
  ) {
    super(metadataStore, extentStore, logger);
  }

  public setAccessControl(
    options: Models.BlobSetAccessControlOptionalParams,
    context: Context
  ): Promise<Models.BlobSetAccessControlResponse> {
    throw new Error("Method not implemented.");
  }

  public getAccessControl(
    options: Models.BlobGetAccessControlOptionalParams,
    context: Context
  ): Promise<Models.BlobGetAccessControlResponse> {
    throw new Error("Method not implemented.");
  }

  public rename(
    renameSource: string,
    options: Models.BlobRenameOptionalParams,
    context: Context
  ): Promise<Models.BlobRenameResponse> {
    throw new Error("Method not implemented.");
  }

  public copyFromURL(
    copySource: string,
    options: Models.BlobCopyFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlobCopyFromURLResponse> {
    throw new Error("Method not implemented.");
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
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;

    const blob = await this.metadataStore.downloadBlob(
      context,
      accountName,
      containerName,
      blobName,
      options.snapshot,
      options.leaseAccessConditions
    );

    if (blob.properties.blobType === Models.BlobType.BlockBlob) {
      return this.downloadBlockBlob(options, context, blob);
    } else if (blob.properties.blobType === Models.BlobType.PageBlob) {
      return this.downloadPageBlob(options, context, blob);
    } else if (blob.properties.blobType === Models.BlobType.AppendBlob) {
      // TODO: Handle append blob
      throw new NotImplementedError(context.contextId);
    } else {
      throw StorageErrorFactory.getInvalidOperation(context.contextId!);
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.getBlobProperties(
      context,
      account,
      container,
      blob,
      options.snapshot,
      options.leaseAccessConditions
    );

    // TODO: Create get metadata specific request in swagger
    const againstMetadata = context.request!.getQuery("comp") === "metadata";

    const response: Models.BlobGetPropertiesResponse = againstMetadata
      ? {
          statusCode: 200,
          metadata: res.metadata,
          eTag: res.properties.etag,
          requestId: context.contextId,
          version: BLOB_API_VERSION,
          date: context.startTime,
          clientRequestId: options.requestId
        }
      : {
          statusCode: 200,
          metadata: res.metadata,
          isIncrementalCopy: res.properties.incrementalCopy,
          eTag: res.properties.etag,
          requestId: context.contextId,
          version: BLOB_API_VERSION,
          date: context.startTime,
          acceptRanges: "bytes",
          blobCommittedBlockCount: undefined, // TODO: Append blob
          isServerEncrypted: true,
          clientRequestId: options.requestId,
          ...res.properties
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    await this.metadataStore.deleteBlob(
      context,
      account,
      container,
      blob,
      options
    );

    const response: Models.BlobDeleteResponse = {
      statusCode: 202,
      requestId: context.contextId,
      date: context.startTime,
      version: BLOB_API_VERSION,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Undelete blob.
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
    throw new NotImplementedError(context.contextId);
  }

  /**
   * Set HTTP Headers.
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.setBlobHTTPHeaders(
      context,
      account,
      container,
      blob,
      options.leaseAccessConditions,
      options.blobHTTPHeaders
    );

    // ToDo: return correct headers and test for these.
    const response: Models.BlobSetHTTPHeadersResponse = {
      statusCode: 200,
      eTag: res.etag,
      lastModified: res.lastModified,
      blobSequenceNumber: res.blobSequenceNumber,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Set Metadata.
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.setBlobMetadata(
      context,
      account,
      container,
      blob,
      options.leaseAccessConditions,
      options.metadata
    );

    // ToDo: return correct headers and test for these.
    const response: Models.BlobSetMetadataResponse = {
      statusCode: 200,
      eTag: res.etag,
      lastModified: res.lastModified,
      isServerEncrypted: true,
      requestId: context.contextId,
      date: context.startTime,
      version: BLOB_API_VERSION,
      clientRequestId: options.requestId
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
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.acquireBlobLease(
      context,
      account,
      container,
      blob,
      options.duration!,
      options.proposedLeaseId
    );

    const response: Models.BlobAcquireLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      leaseId: res.leaseId,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      statusCode: 201,
      clientRequestId: options.requestId
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
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.releaseBlobLease(
      context,
      account,
      container,
      blob,
      leaseId
    );

    const response: Models.BlobReleaseLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: res.etag,
      lastModified: res.lastModified,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      statusCode: 200,
      clientRequestId: options.requestId
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
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.renewBlobLease(
      context,
      account,
      container,
      blob,
      leaseId
    );

    const response: Models.BlobRenewLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      leaseId: res.leaseId,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      statusCode: 200,
      clientRequestId: options.requestId
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
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.changeBlobLease(
      context,
      account,
      container,
      blob,
      leaseId,
      proposedLeaseId
    );

    const response: Models.BlobChangeLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      leaseId: res.leaseId,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      statusCode: 200,
      clientRequestId: options.requestId
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
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.breakBlobLease(
      context,
      account,
      container,
      blob,
      options.breakPeriod
    );

    const response: Models.BlobBreakLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      leaseTime: res.leaseTime,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      statusCode: 202,
      clientRequestId: options.requestId
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.createSnapshot(
      context,
      account,
      container,
      blob,
      options.leaseAccessConditions,
      options.metadata
    );

    const response: Models.BlobCreateSnapshotResponse = {
      statusCode: 201,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      requestId: context.contextId,
      date: context.startTime!,
      version: BLOB_API_VERSION,
      snapshot: res.snapshot,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Start copy from Url.
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    // TODO: Check dest Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const url = new URL(copySource);
    const [
      sourceAccount,
      sourceContainer,
      sourceBlob
    ] = extractStoragePartsFromPath(url.pathname);
    const snapshot = url.searchParams.get("snapshot") || "";

    if (
      sourceAccount !== blobCtx.account ||
      sourceAccount === undefined ||
      sourceContainer === undefined ||
      sourceBlob === undefined
    ) {
      throw StorageErrorFactory.getBlobNotFound(context.contextId!);
    }

    const res = await this.metadataStore.startCopyFromURL(
      context,
      {
        account: sourceAccount,
        container: sourceContainer,
        blob: sourceBlob,
        snapshot
      },
      { account, container, blob },
      copySource,
      options.metadata,
      options.tier,
      options.leaseAccessConditions
    );

    const response: Models.BlobStartCopyFromURLResponse = {
      statusCode: 202,
      eTag: res.etag,
      lastModified: res.lastModified,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime,
      copyId: res.copyId,
      copyStatus: res.copyStatus,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Abort copy from Url.
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
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const blob = await this.metadataStore.downloadBlob(
      context,
      accountName,
      containerName,
      blobName,
      undefined
    );

    if (blob.properties.copyId !== copyId) {
      throw StorageErrorFactory.getCopyIdMismatch(context.contextId!);
    }

    if (blob.properties.copyStatus === Models.CopyStatusType.Success) {
      throw StorageErrorFactory.getNoPendingCopyOperation(context.contextId!);
    }

    const response: Models.BlobAbortCopyFromURLResponse = {
      statusCode: 204,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Set blob tier.
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
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.setTier(
      context,
      account,
      container,
      blob,
      tier,
      undefined
    );

    const response: Models.BlobSetTierResponse = {
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      statusCode: res,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Get account information.
   *
   * @param {Context} context
   * @returns {Promise<Models.BlobGetAccountInfoResponse>}
   * @memberof BlobHandler
   */
  public async getAccountInfo(
    context: Context
  ): Promise<Models.BlobGetAccountInfoResponse> {
    const response: Models.BlobGetAccountInfoResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: context.request!.getHeader("x-ms-client-request-id"),
      skuName: EMULATOR_ACCOUNT_SKUNAME,
      accountKind: EMULATOR_ACCOUNT_KIND,
      date: context.startTime!,
      version: BLOB_API_VERSION
    };
    return response;
  }

  /**
   * Get account information with headers.
   *
   * @param {Context} context
   * @returns {Promise<Models.BlobGetAccountInfoResponse>}
   * @memberof BlobHandler
   */
  public async getAccountInfoWithHead(
    context: Context
  ): Promise<Models.BlobGetAccountInfoResponse> {
    return this.getAccountInfo(context);
  }

  /**
   * Download block blob.
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
    if (blob.isCommitted === false) {
      throw StorageErrorFactory.getBlobNotFound(context.contextId!);
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
      context.contextId
    );

    let bodyGetter: () => Promise<NodeJS.ReadableStream | undefined>;
    const blocks = blob.committedBlocksInOrder;
    if (blocks === undefined || blocks.length === 0) {
      bodyGetter = async () => {
        if (blob.persistency === undefined) {
          return this.extentStore.readExtent(undefined, context.contextId);
        }
        return this.extentStore.readExtent(
          {
            id: blob.persistency.id,
            offset: blob.persistency.offset + rangeStart,
            count: Math.min(blob.persistency.count, contentLength)
          },
          context.contextId
        );
      };
    } else {
      bodyGetter = async () => {
        return this.extentStore.readExtents(
          blocks.map(block => block.persistency),
          rangeStart,
          rangeEnd + 1 - rangeStart,
          context.contextId
        );
      };
    }

    let contentRange: string | undefined;
    if (
      context.request!.getHeader("range") ||
      context.request!.getHeader("x-ms-range")
    ) {
      contentRange = `bytes ${rangeStart}-${rangeEnd}/${blob.properties
        .contentLength!}`;
    }

    let body: NodeJS.ReadableStream | undefined = await bodyGetter();
    let contentMD5: Uint8Array | undefined;
    if (!partialRead) {
      contentMD5 = blob.properties.contentMD5;
    }
    if (
      contentLength <= 4 * 1024 * 1024 &&
      contentMD5 === undefined &&
      body !== undefined
    ) {
      contentMD5 = await getMD5FromStream(body);
      body = await bodyGetter();
    }

    const response: Models.BlobDownloadResponse = {
      statusCode: contentRange ? 206 : 200,
      body,
      metadata: blob.metadata,
      eTag: blob.properties.etag,
      requestId: context.contextId,
      date: context.startTime!,
      version: BLOB_API_VERSION,
      ...blob.properties,
      blobContentMD5: blob.properties.contentMD5,
      contentLength,
      contentRange,
      contentMD5,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Download page blob.
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
    const partialRead = contentLength !== blob.properties.contentLength!;

    this.logger.info(
      // tslint:disable-next-line:max-line-length
      `BlobHandler:downloadPageBlob() NormalizedDownloadRange=bytes=${rangeStart}-${rangeEnd} RequiredContentLength=${contentLength}`,
      context.contextId
    );

    // if (contentLength <= 0) {
    //   return {
    //     statusCode: 200,
    //     body: undefined,
    //     metadata: blob.metadata,
    //     eTag: blob.properties.etag,
    //     requestId: context.contextID,
    //     date: context.startTime!,
    //     version: BLOB_API_VERSION,
    //     ...blob.properties,
    //     contentLength,
    //     contentMD5: undefined
    //   };
    // }

    blob.pageRangesInOrder = blob.pageRangesInOrder || [];
    const ranges =
      contentLength <= 0
        ? []
        : this.rangesManager.fillZeroRanges(blob.pageRangesInOrder, {
            start: rangeStart,
            end: rangeEnd
          });

    const bodyGetter = async () => {
      return this.extentStore.readExtents(
        ranges.map(value => value.persistency),
        0,
        contentLength,
        context.contextId
      );
    };

    let body: NodeJS.ReadableStream | undefined = await bodyGetter();
    let contentMD5: Uint8Array | undefined;
    if (!partialRead) {
      contentMD5 = blob.properties.contentMD5;
    }
    if (
      contentLength <= 4 * 1024 * 1024 &&
      contentMD5 === undefined &&
      body !== undefined
    ) {
      contentMD5 = await getMD5FromStream(body);
      body = await bodyGetter();
    }

    const response: Models.BlobDownloadResponse = {
      statusCode: rangesParts[1] === Infinity ? 200 : 206,
      body,
      metadata: blob.metadata,
      eTag: blob.properties.etag,
      requestId: context.contextId,
      date: context.startTime!,
      version: BLOB_API_VERSION,
      ...blob.properties,
      contentLength,
      contentMD5,
      blobContentMD5: blob.properties.contentMD5,
      isServerEncrypted: true,
      clientRequestId: options.requestId
    };

    return response;
  }
}
