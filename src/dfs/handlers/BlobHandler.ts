import { URLBuilder } from "@azure/ms-rest-js";
import axios, { AxiosResponse } from "axios";
import { URL } from "url";

import IExtentStore from "../../common/persistence/IExtentStore";
import { convertRawHeadersToMetadata } from "../../common/utils/utils";
import DataLakeContext from "../context/DataLakeContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlobHandler from "../generated/handlers/IBlobHandler";
import ILogger from "../generated/utils/ILogger";
import { parseXML } from "../generated/utils/xml";
import { extractStoragePartsFromPath } from "../middlewares/blobStorageContext.middleware";
import IDataLakeMetadataStore from "../persistence/IDataLakeMetadataStore";
import {
  BLOB_API_VERSION,
  EMULATOR_ACCOUNT_KIND,
  EMULATOR_ACCOUNT_SKUNAME,
  HeaderConstants
} from "../utils/constants";
import BaseHandler from "./BaseHandler";
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
    metadataStore: IDataLakeMetadataStore,
    extentStore: IExtentStore,
    logger: ILogger,
    loose: boolean
  ) {
    super(metadataStore, extentStore, logger, loose);
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
    throw new NotImplementedError(context);
  }

  public async setExpiry(
    expiryOptions: Models.BlobExpiryOptions,
    options: Models.BlobSetExpiryOptionalParams,
    context: Context
  ): Promise<Models.BlobSetExpiryResponse> {
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = context.startTime!;

    const blobModel = await this.metadataStore.downloadBlob(
      context,
      accountName,
      containerName,
      blobName,
      ""
    );

    if (
      options.expiresOn === undefined &&
      expiryOptions !== Models.BlobExpiryOptions.NeverExpire
    ) {
      throw StorageErrorFactory.getMissingRequestHeader(context);
    }
    let expiresOn: Date | undefined;
    let timeToExpireInMs;
    let startDate = date;
    switch (expiryOptions) {
      case Models.BlobExpiryOptions.NeverExpire:
        expiresOn = undefined;
        break;
      case Models.BlobExpiryOptions.RelativeToCreation:
        startDate = blobModel.properties.creationTime!;
      case Models.BlobExpiryOptions.RelativeToNow:
        timeToExpireInMs = parseInt(options.expiresOn!);
        if (isNaN(timeToExpireInMs)) {
          throw StorageErrorFactory.getInvalidHeaderValue(context);
        }
        expiresOn = new Date(startDate.getTime() + timeToExpireInMs);
        break;
      case Models.BlobExpiryOptions.Absolute:
        expiresOn = new Date(options.expiresOn!);
        break;
    }

    blobModel.properties.expiresOn = expiresOn;
    await this.metadataStore.createBlob(context, blobModel);

    const response: Models.BlobSetExpiryResponse = {
      statusCode: 200,
      clientRequestId: options.requestId,
      requestId: context.contextId,
      date,
      eTag: blobModel.properties.etag,
      lastModified: blobModel.properties.lastModified
    };

    return response;
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    let res;

    // Workaround for https://github.com/Azure/Azurite/issues/332
    const sequenceNumberAction = context.request!.getHeader(
      HeaderConstants.X_MS_SEQUENCE_NUMBER_ACTION
    );
    const sequenceNumber = context.request!.getHeader(
      HeaderConstants.X_MS_BLOB_SEQUENCE_NUMBER
    );
    if (sequenceNumberAction !== undefined) {
      this.logger.verbose(
        "BlobHandler:setHTTPHeaders() Redirect to updateSequenceNumber...",
        context.contextId
      );
      res = await this.metadataStore.updateSequenceNumber(
        context,
        account,
        container,
        blob,
        sequenceNumberAction.toLowerCase() as Models.SequenceNumberActionType,
        sequenceNumber === undefined ? undefined : parseInt(sequenceNumber, 10),
        options.leaseAccessConditions,
        options.modifiedAccessConditions
      );
    } else {
      res = await this.metadataStore.setBlobHTTPHeaders(
        context,
        account,
        container,
        blob,
        options.leaseAccessConditions,
        options.blobHTTPHeaders,
        options.modifiedAccessConditions
      );
    }

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

  public async setImmutabilityPolicy(
    options: Models.BlobSetImmutabilityPolicyOptionalParams,
    context: Context
  ): Promise<Models.BlobSetImmutabilityPolicyResponse> {
    throw new NotImplementedError(context);
  }

  public async deleteImmutabilityPolicy(
    options: Models.BlobDeleteImmutabilityPolicyOptionalParams,
    context: Context
  ): Promise<Models.BlobDeleteImmutabilityPolicyResponse> {
    throw new NotImplementedError(context);
  }

  public async setLegalHold(
    legalHold: boolean,
    options: Models.BlobSetLegalHoldOptionalParams,
    context: Context
  ): Promise<Models.BlobSetLegalHoldResponse> {
    throw new NotImplementedError(context);
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders()
    );

    const res = await this.metadataStore.setBlobMetadata(
      context,
      account,
      container,
      blob,
      options.leaseAccessConditions,
      metadata,
      options.modifiedAccessConditions
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
   * Acquire Blob Lease.
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const snapshot = blobCtx.request!.getQuery("snapshot");

    if (snapshot !== undefined && snapshot !== "") {
      throw StorageErrorFactory.getInvalidOperation(
        context,
        "A lease cannot be granted for a blob snapshot"
      );
    }

    const res = await this.metadataStore.acquireBlobLease(
      context,
      account,
      container,
      blob,
      options.duration!,
      options.proposedLeaseId,
      options
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.releaseBlobLease(
      context,
      account,
      container,
      blob,
      leaseId,
      options
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.renewBlobLease(
      context,
      account,
      container,
      blob,
      leaseId,
      options
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.changeBlobLease(
      context,
      account,
      container,
      blob,
      leaseId,
      proposedLeaseId,
      options
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.breakBlobLease(
      context,
      account,
      container,
      blob,
      options.breakPeriod,
      options
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders()
    );

    const res = await this.metadataStore.createSnapshot(
      context,
      account,
      container,
      blob,
      options.leaseAccessConditions,
      !options.metadata || JSON.stringify(options.metadata) === "{}"
        ? undefined
        : metadata,
      options.modifiedAccessConditions
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    // TODO: Check dest Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const url = new URL(copySource);
    const [sourceAccount, sourceContainer, sourceBlob] =
      extractStoragePartsFromPath(
        url.hostname,
        url.pathname,
        blobCtx.disableProductStyleUrl
      );
    const snapshot = url.searchParams.get("snapshot") || "";

    if (
      sourceAccount === undefined ||
      sourceContainer === undefined ||
      sourceBlob === undefined
    ) {
      throw StorageErrorFactory.getBlobNotFound(context);
    }

    if (sourceAccount !== blobCtx.account) {
      await this.validateCopySource(copySource, sourceAccount, context);
    }

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders()
    );

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
      metadata,
      options.tier,
      options
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

  private async validateCopySource(
    copySource: string,
    sourceAccount: string,
    context: Context
  ): Promise<void> {
    // Currently the only cross-account copy support is from/to the same Azurite instance. In either case access
    // is determined by performing a request to the copy source to see if the authentication is valid.
    const blobCtx = new DataLakeContext(context);

    const currentServer = blobCtx.request!.getHeader("Host") || "";
    const url = new URL(copySource);
    if (currentServer !== url.host) {
      this.logger.error(
        `BlobHandler:startCopyFromURL() Source account ${url} is not on the same Azurite instance as target account ${blobCtx.account}`,
        context.contextId
      );

      throw StorageErrorFactory.getCannotVerifyCopySource(
        context,
        404,
        "The specified resource does not exist"
      );
    }

    this.logger.debug(
      `BlobHandler:startCopyFromURL() Validating access to the source account ${sourceAccount}`,
      context.contextId
    );

    // In order to retrieve proper error details we make a metadata request to the copy source. If we instead issue
    // a HEAD request then the error details are not returned and reporting authentication failures to the caller
    // becomes a black box.
    const metadataUrl = URLBuilder.parse(copySource);
    metadataUrl.setQueryParameter("comp", "metadata");
    const validationResponse: AxiosResponse = await axios.get(
      metadataUrl.toString(),
      {
        // Instructs axios to not throw an error for non-2xx responses
        validateStatus: () => true
      }
    );
    if (validationResponse.status === 200) {
      this.logger.debug(
        `BlobHandler:startCopyFromURL() Successfully validated access to source account ${sourceAccount}`,
        context.contextId
      );
    } else {
      this.logger.debug(
        `BlobHandler:startCopyFromURL() Access denied to source account ${sourceAccount} StatusCode=${validationResponse.status}, AuthenticationErrorDetail=${validationResponse.data}`,
        context.contextId
      );

      if (validationResponse.status === 404) {
        throw StorageErrorFactory.getCannotVerifyCopySource(
          context,
          validationResponse.status,
          "The specified resource does not exist"
        );
      } else {
        // For non-successful responses attempt to unwrap the error message from the metadata call.
        let message: string =
          "Could not verify the copy source within the specified time.";
        if (
          validationResponse.headers[HeaderConstants.CONTENT_TYPE] ===
          "application/xml"
        ) {
          const authenticationError = await parseXML(validationResponse.data);
          if (authenticationError.Message !== undefined) {
            message = authenticationError.Message.replace(/\n+/gm, "");
          }
        }

        throw StorageErrorFactory.getCannotVerifyCopySource(
          context,
          validationResponse.status,
          message
        );
      }
    }
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
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const blob = await this.metadataStore.downloadBlob(
      context,
      accountName,
      containerName,
      blobName,
      undefined,
      options.leaseAccessConditions
    );

    if (blob.properties.copyId !== copyId) {
      throw StorageErrorFactory.getCopyIdMismatch(context);
    }

    if (blob.properties.copyStatus === Models.CopyStatusType.Success) {
      throw StorageErrorFactory.getNoPendingCopyOperation(context);
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
   * Copy from Url.
   *
   * @param {string} copySource
   * @param {Models.BlobStartCopyFromURLOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.BlobStartCopyFromURLResponse>}
   * @memberof BlobHandler
   */
  public async copyFromURL(
    copySource: string,
    options: Models.BlobCopyFromURLOptionalParams,
    context: Context
  ): Promise<Models.BlobCopyFromURLResponse> {
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    // TODO: Check dest Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const url = new URL(copySource);
    const [sourceAccount, sourceContainer, sourceBlob, orginalSource] =
      extractStoragePartsFromPath(
        url.hostname,
        url.pathname,
        blobCtx.disableProductStyleUrl
      );

    if (
      sourceAccount === undefined ||
      sourceContainer === undefined ||
      sourceBlob === undefined ||
      orginalSource === undefined
    ) {
      throw StorageErrorFactory.getBlobNotFound(context);
    }

    const snapshot = url.searchParams.get("snapshot") || "";

    if (sourceAccount !== blobCtx.account) {
      await this.validateCopySource(copySource, sourceAccount, context);
    }

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders()
    );

    const res = await this.metadataStore.copyFromURL(
      context,
      {
        account: sourceAccount,
        container: sourceContainer,
        blob: sourceBlob,
        snapshot
      },
      { account, container, blob },
      copySource,
      metadata,
      options.tier,
      options
    );

    let copyStatus: Models.SyncCopyStatusType | undefined;
    if (res.copyStatus !== undefined) {
      if (res.copyStatus === Models.CopyStatusType.Success) {
        copyStatus = Models.SyncCopyStatusType.Success;
      } else {
        throw StorageErrorFactory.getUnexpectedSyncCopyStatus(
          context,
          res.copyStatus
        );
      }
    }

    const response: Models.BlobCopyFromURLResponse = {
      statusCode: 202,
      eTag: res.etag,
      lastModified: res.lastModified,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime,
      copyId: res.copyId,
      copyStatus,
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
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const res = await this.metadataStore.setTier(
      context,
      account,
      container,
      blob,
      tier,
      options.leaseAccessConditions
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

  public async query(
    options: Models.BlobQueryOptionalParams,
    context: Context
  ): Promise<Models.BlobQueryResponse> {
    throw new NotImplementedError(context);
  }

  public async getTags(
    options: Models.BlobGetTagsOptionalParams,
    context: Context
  ): Promise<Models.BlobGetTagsResponse> {
    throw new NotImplementedError(context);
  }

  public async setTags(
    options: Models.BlobSetTagsOptionalParams,
    context: Context
  ): Promise<Models.BlobSetTagsResponse> {
    throw new NotImplementedError(context);
  }
}
