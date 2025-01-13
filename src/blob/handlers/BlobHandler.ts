import { URLBuilder } from "@azure/ms-rest-js";
import axios, { AxiosResponse } from "axios";
import { URL } from "url";

import IExtentStore from "../../common/persistence/IExtentStore";
import {
  convertRawHeadersToMetadata,
  getMD5FromStream
} from "../../common/utils/utils";
import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlobHandler from "../generated/handlers/IBlobHandler";
import ILogger from "../generated/utils/ILogger";
import { parseXML } from "../generated/utils/xml";
import { extractStoragePartsFromPath } from "../middlewares/blobStorageContext.middleware";
import IBlobMetadataStore, {
  BlobModel
} from "../persistence/IBlobMetadataStore";
import {
  BLOB_API_VERSION,
  EMULATOR_ACCOUNT_KIND,
  EMULATOR_ACCOUNT_SKUNAME,
  HeaderConstants
} from "../utils/constants";
import {
  deserializePageBlobRangeHeader,
  deserializeRangeHeader,
  getBlobTagsCount,
  validateBlobTag
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
    metadataStore: IBlobMetadataStore,
    extentStore: IExtentStore,
    logger: ILogger,
    loose: boolean,
    private readonly rangesManager: IPageBlobRangesManager
  ) {
    super(metadataStore, extentStore, logger, loose);
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
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    if (blob.properties.accessTier === Models.AccessTier.Archive) {
      throw StorageErrorFactory.getBlobArchived(context.contextId!);
    }

    if (blob.properties.blobType === Models.BlobType.BlockBlob) {
      return this.downloadBlockBlobOrAppendBlob(options, context, blob);
    } else if (blob.properties.blobType === Models.BlobType.PageBlob) {
      return this.downloadPageBlob(options, context, blob);
    } else if (blob.properties.blobType === Models.BlobType.AppendBlob) {
      return this.downloadBlockBlobOrAppendBlob(options, context, blob);
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
      options.leaseAccessConditions,
      options.modifiedAccessConditions
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
        clientRequestId: options.requestId,
        contentLength: res.properties.contentLength,
        lastModified: res.properties.lastModified
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
        blobCommittedBlockCount:
          res.properties.blobType === Models.BlobType.AppendBlob
            ? res.blobCommittedBlockCount
            : undefined,
        isServerEncrypted: true,
        clientRequestId: options.requestId,
        ...res.properties,
        cacheControl: context.request!.getQuery("rscc") ?? res.properties.cacheControl,
        contentDisposition: context.request!.getQuery("rscd") ?? res.properties.contentDisposition,
        contentEncoding: context.request!.getQuery("rsce") ?? res.properties.contentEncoding,
        contentLanguage: context.request!.getQuery("rscl") ?? res.properties.contentLanguage,
        contentType: context.request!.getQuery("rsct") ?? res.properties.contentType,
        tagCount: res.properties.tagCount,
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
      clientRequestId: options.requestId,
      deleteTypePermanent: true
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

  public async setExpiry(
    expiryOptions: Models.BlobExpiryOptions,
    options: Models.BlobSetExpiryOptionalParams,
    context: Context
  ): Promise<Models.BlobSetExpiryResponse> {
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
    throw new NotImplementedError(context.contextId);
  }

  public async deleteImmutabilityPolicy(
    options: Models.BlobDeleteImmutabilityPolicyOptionalParams,
    context: Context
  ): Promise<Models.BlobDeleteImmutabilityPolicyResponse> {
    throw new NotImplementedError(context.contextId);
  }

  public async setLegalHold(
    legalHold: boolean,
    options: Models.BlobSetLegalHoldOptionalParams,
    context: Context
  ): Promise<Models.BlobSetLegalHoldResponse> {
    throw new NotImplementedError(context.contextId);
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

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders(), context.contextId!
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const snapshot = blobCtx.request!.getQuery("snapshot");

    if (snapshot !== undefined && snapshot !== "") {
      throw StorageErrorFactory.getInvalidOperation(
        context.contextId,
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
    const blobCtx = new BlobStorageContext(context);
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
    const blobCtx = new BlobStorageContext(context);
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
    const blobCtx = new BlobStorageContext(context);
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders(), context.contextId!
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    // TODO: Check dest Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const url = this.NewUriFromCopySource(copySource, context);
    const [
      sourceAccount,
      sourceContainer,
      sourceBlob
    ] = extractStoragePartsFromPath(url.hostname, url.pathname, blobCtx.disableProductStyleUrl);
    const snapshot = url.searchParams.get("snapshot") || "";

    if (
      sourceAccount === undefined ||
      sourceContainer === undefined ||
      sourceBlob === undefined
    ) {
      throw StorageErrorFactory.getBlobNotFound(context.contextId!);
    }

    const sig = url.searchParams.get("sig");
    if ((sourceAccount !== blobCtx.account) || (sig !== null)) {
      await this.validateCopySource(copySource, sourceAccount, context);
    }

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders(), context.contextId!
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

  private async validateCopySource(copySource: string, sourceAccount: string, context: Context): Promise<void> {
    // Currently the only cross-account copy support is from/to the same Azurite instance. In either case access
    // is determined by performing a request to the copy source to see if the authentication is valid.
    const blobCtx = new BlobStorageContext(context);

    const currentServer = blobCtx.request!.getHeader("Host") || "";
    const url = this.NewUriFromCopySource(copySource, context);
    if (currentServer !== url.host) {
      this.logger.error(
        `BlobHandler:startCopyFromURL() Source account ${url} is not on the same Azurite instance as target account ${blobCtx.account}`,
        context.contextId
      );

      throw StorageErrorFactory.getCannotVerifyCopySource(
        context.contextId!,
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
          context.contextId!,
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
          context.contextId!,
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
    const blobCtx = new BlobStorageContext(context);
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
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    // TODO: Check dest Lease status, and set to available if it's expired, see sample in BlobHandler.setMetadata()
    const url = this.NewUriFromCopySource(copySource, context);
    const [
      sourceAccount,
      sourceContainer,
      sourceBlob
    ] = extractStoragePartsFromPath(url.hostname, url.pathname, blobCtx.disableProductStyleUrl);
    const snapshot = url.searchParams.get("snapshot") || "";

    if (
      sourceAccount === undefined ||
      sourceContainer === undefined ||
      sourceBlob === undefined
    ) {
      throw StorageErrorFactory.getBlobNotFound(context.contextId!);
    }

    if (sourceAccount !== blobCtx.account) {
      await this.validateCopySource(copySource, sourceAccount, context);
    }

    // Specifying x-ms-copy-source-tag-option as COPY and x-ms-tags will result in error
    if (options.copySourceTags === Models.BlobCopySourceTags.COPY && options.blobTagsString !== undefined) {
      throw StorageErrorFactory.getBothUserTagsAndSourceTagsCopyPresentException(context.contextId!);
    }

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders(), context.contextId!
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
          context.contextId!,
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

  /**
   * Download block blob or append blob.
   *
   * @private
   * @param {Models.BlobDownloadOptionalParams} options
   * @param {Context} context
   * @param {BlobModel} blob
   * @returns {Promise<Models.BlobDownloadResponse>}
   * @memberof BlobHandler
   */
  private async downloadBlockBlobOrAppendBlob(
    options: Models.BlobDownloadOptionalParams,
    context: Context,
    blob: BlobModel
  ): Promise<Models.BlobDownloadResponse> {
    if (blob.isCommitted === false) {
      throw StorageErrorFactory.getBlobNotFound(context.contextId!);
    }

    let rangesParts = undefined;
    try {
      // Deserializer doesn't handle range header currently, manually parse range headers here
      rangesParts = deserializeRangeHeader(
        context.request!.getHeader("range"),
        context.request!.getHeader("x-ms-range")
      );
    } catch (err) {
      this.logger.info(
        `BlobHandler:downloadBlockBlobOrAppendBlob() Ignoring range request due to invalid content range: ${err.message}`,
        context.contextId
      );
      // Ignoring range request as per RFC 9110, section 14.2
    }
    const rangeStart = rangesParts ? rangesParts[0] : 0;
    let rangeEnd = rangesParts ? rangesParts[1] : Infinity;

    // Start Range is bigger than blob length
    if (rangeStart > blob.properties.contentLength!) {
      throw StorageErrorFactory.getInvalidPageRange2(context.contextId!,`bytes */${blob.properties.contentLength}`);
    }

    // Will automatically shift request with longer data end than blob size to blob size
    if (rangeEnd + 1 >= blob.properties.contentLength!) {
      // report error is blob size is 0, and rangeEnd is specified but not 0 
      if (blob.properties.contentLength == 0 && rangeEnd !== 0 && rangeEnd !== Infinity) {
        throw StorageErrorFactory.getInvalidPageRange2(context.contextId!,`bytes */${blob.properties.contentLength}`);
      }
      else {
        rangeEnd = blob.properties.contentLength! - 1;
      }
    }

    const contentLength = rangeEnd - rangeStart + 1;
    const partialRead = contentLength !== blob.properties.contentLength!;

    this.logger.info(
      // tslint:disable-next-line:max-line-length
      `BlobHandler:downloadBlockBlobOrAppendBlob() NormalizedDownloadRange=bytes=${rangeStart}-${rangeEnd} RequiredContentLength=${contentLength}`,
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
          blocks.map((block) => block.persistency),
          rangeStart,
          rangeEnd + 1 - rangeStart,
          context.contextId
        );
      };
    }

    let contentRange: string | undefined;
    if (rangesParts) {
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
      cacheControl: context.request!.getQuery("rscc") ?? blob.properties.cacheControl,
      contentDisposition: context.request!.getQuery("rscd") ?? blob.properties.contentDisposition,
      contentEncoding: context.request!.getQuery("rsce") ?? blob.properties.contentEncoding,
      contentLanguage: context.request!.getQuery("rscl") ?? blob.properties.contentLanguage,
      contentType: context.request!.getQuery("rsct") ?? blob.properties.contentType,
      blobContentMD5: blob.properties.contentMD5,
      acceptRanges: "bytes",
      contentLength,
      contentRange,
      contentMD5: contentRange ? (context.request!.getHeader("x-ms-range-get-content-md5") ? contentMD5: undefined) : contentMD5,
      tagCount: getBlobTagsCount(blob.blobTags),
      isServerEncrypted: true,
      clientRequestId: options.requestId,
      creationTime: blob.properties.creationTime,
      blobCommittedBlockCount:
        blob.properties.blobType === Models.BlobType.AppendBlob
          ? (blob.committedBlocksInOrder || []).length
          : undefined,
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
      context.request!.getHeader("x-ms-range"),
      false
    );
    const rangeStart = rangesParts[0];
    let rangeEnd = rangesParts[1];

    // Start Range is bigger than blob length
    if (rangeStart > blob.properties.contentLength!) {
      throw StorageErrorFactory.getInvalidPageRange2(context.contextId!,`bytes */${blob.properties.contentLength}`);
    }

    // Will automatically shift request with longer data end than blob size to blob size
    if (rangeEnd + 1 >= blob.properties.contentLength!) {
      // report error is blob size is 0, and rangeEnd is specified but not 0 
      if (blob.properties.contentLength == 0 && rangeEnd !== 0 && rangeEnd !== Infinity) {
        throw StorageErrorFactory.getInvalidPageRange2(context.contextId!,`bytes */${blob.properties.contentLength}`);
      }
      else {
        rangeEnd = blob.properties.contentLength! - 1;
      }
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
        ranges.map((value) => value.persistency),
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

    let contentRange: string | undefined;
    if (
      context.request!.getHeader("range") ||
      context.request!.getHeader("x-ms-range")
    ) {
      contentRange = `bytes ${rangeStart}-${rangeEnd}/${blob.properties
        .contentLength!}`;
    }

    const response: Models.BlobDownloadResponse = {
      statusCode:
        rangesParts[1] === Infinity && rangesParts[0] === 0 ? 200 : 206,
      body,
      metadata: blob.metadata,
      eTag: blob.properties.etag,
      requestId: context.contextId,
      date: context.startTime!,
      version: BLOB_API_VERSION,
      ...blob.properties,
      cacheControl: context.request!.getQuery("rscc") ?? blob.properties.cacheControl,
      contentDisposition: context.request!.getQuery("rscd") ?? blob.properties.contentDisposition,
      contentEncoding: context.request!.getQuery("rsce") ?? blob.properties.contentEncoding,
      contentLanguage: context.request!.getQuery("rscl") ?? blob.properties.contentLanguage,
      contentType: context.request!.getQuery("rsct") ?? blob.properties.contentType,
      contentLength,
      contentRange,
      contentMD5: contentRange ? (context.request!.getHeader("x-ms-range-get-content-md5") ? contentMD5: undefined) : contentMD5,
      blobContentMD5: blob.properties.contentMD5,
      tagCount: getBlobTagsCount(blob.blobTags),
      isServerEncrypted: true,
      creationTime: blob.properties.creationTime,
      clientRequestId: options.requestId
    };

    return response;
  }

  public async query(
    options: Models.BlobQueryOptionalParams,
    context: Context
  ): Promise<Models.BlobQueryResponse> {
    throw new NotImplementedError(context.contextId);
  }

  public async getTags(
    options: Models.BlobGetTagsOptionalParams,
    context: Context
  ): Promise<Models.BlobGetTagsResponse> {
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const tags = await this.metadataStore.getBlobTag(
      context,
      account,
      container,
      blob,
      options.snapshot,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.BlobGetTagsResponse = {
      statusCode: 200,
      blobTagSet: tags === undefined ? [] : tags.blobTagSet,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime,
      clientRequestId: options.requestId,
    };

    return response;
  }

  public async setTags(
    options: Models.BlobSetTagsOptionalParams,
    context: Context
  ): Promise<Models.BlobSetTagsResponse> {
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    // Blob Tags need to set
    const tags = options.tags;
    validateBlobTag(tags!, context.contextId!);

    // Get snapshot (swagger not defined snapshot as parameter, but server support set tag on blob snapshot)
    let snapshot = context.request!.getQuery("snapshot");

    await this.metadataStore.setBlobTag(
      context,
      account,
      container,
      blob,
      snapshot,
      options.leaseAccessConditions,
      tags,
      options.modifiedAccessConditions
    );

    const response: Models.BlobSetTagsResponse = {
      statusCode: 204,
      requestId: context.contextId,
      date: context.startTime,
      version: BLOB_API_VERSION,
      clientRequestId: options.requestId
    };

    return response;
  }

  private NewUriFromCopySource(copySource: string, context: Context): URL {
    try {
      return new URL(copySource)
    }
    catch
    {
      throw StorageErrorFactory.getInvalidHeaderValue(
        context.contextId,
        {
          HeaderName: "x-ms-copy-source",
          HeaderValue: copySource
        })
    }
  }
}
