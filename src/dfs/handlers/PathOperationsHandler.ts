import url from "url";

import BlobBlobHandler from "../../blob/handlers/BlobHandler";
import { BlobModel } from "../../blob/persistence/IBlobMetadataStore";
import ILogger from "../../common/ILogger";
import IExtentStore from "../../common/persistence/IExtentStore";
import {
  getMD5FromStream,
  getUniqueName,
  newEtag
} from "../../common/utils/utils";
import DataLakeContext from "../context/DataLakeContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../../blob/generated/Context";
import IPathOperationsHandler from "../generated/handlers/IPathOperationsHandler";
import IDataLakeMetaDataStore from "../persistence/IDataLakeMetadataStore";
import {
  permissionsStringToAclString,
  toAcl,
  toAclString,
  toPermissions,
  toPermissionsString
} from "../storagefiledatalake/transforms";
import {
  DATA_LAKE_API_VERSION,
  DEFAULT_DIR_PERMISSIONS,
  DEFAULT_FILE_PERMISSIONS,
  DEFAULT_GROUP,
  DEFAULT_OWNER,
  DEFAULT_UMMASK,
  HeaderConstants,
  MAX_APPEND_BLOB_BLOCK_COUNT,
  MAX_APPEND_BLOB_BLOCK_SIZE
} from "../utils/constants";
import { removeSlash } from "../utils/utils";
import BaseHandler from "./BaseHandler";

/**
 * PathOperationsHandler handles Azure Storage DataLake Gen2 path
 *
 * @export
 * @class PathOperationsHandler
 * @extends {BaseHandler}
 * @implements {IBlobHandler}
 */
export default class PathOperationsHandler
  extends BaseHandler
  implements IPathOperationsHandler
{
  constructor(
    private readonly blobHandler: BlobBlobHandler,
    metadataStore: IDataLakeMetaDataStore,
    extentStore: IExtentStore,
    logger: ILogger,
    loose: boolean
  ) {
    super(metadataStore, extentStore, logger, loose);
  }

  async create(
    options: Models.PathCreateOptionalParams,
    context: Context
  ): Promise<Models.PathCreateResponse> {
      if (options.properties) {
        const metadata: { [propertyName: string]: string } =
          options.metadata || {};
        const metaDataValues = options.properties.split(",");
        metaDataValues.forEach((pair) => {
          const idx = pair.indexOf("=");
          const name = pair.substring(0, idx);
          const value = Buffer.from(
            pair.substring(idx + 1),
            "base64"
          ).toString();

          metadata[name] = value;
        });

        options.metadata = metadata;
      }

      let response: Models.PathCreateResponse;
      if (options.resource === "file") {
        response = await this.createBlob(options, context);
      } else if (options.resource === "directory") {
        response = await this.createDirectory(options, context);
      } else if (options.renameSource) {
        response = await this.rename(options, context);
      } else {
        throw StorageErrorFactory.getInvalidQueryParameterValue(
          context,
          "resource",
          options.resource,
          "resource must be set to either 'file' or 'directory' or renameSource is set"
        );
      }

      return response;
  }

  async update(
    action: Models.PathUpdateAction,
    mode: Models.PathSetAccessControlRecursiveMode,
    body: NodeJS.ReadableStream,
    options: Models.PathUpdateOptionalParams,
    context: Context
  ): Promise<Models.PathUpdateResponse> {
    switch (action) {
      case Models.PathUpdateAction.Append:
        return await this.appendData(body, options, context);
      case Models.PathUpdateAction.Flush:
        return await this.flushData(options, context);
      case Models.PathUpdateAction.SetAccessControl:
        return await this.setAccessControl(options, context);
      case Models.PathUpdateAction.SetAccessControlRecursive:
        return await this.setAccessControlRecursive(mode, options, context);
      case Models.PathUpdateAction.SetProperties:
        return await this.setProperties(options, context);
    }
  }

  async lease(
    xMsLeaseAction: Models.PathLeaseAction,
    options: Models.PathLeaseOptionalParams,
    context: Context
  ): Promise<Models.PathLeaseResponse> {
    let response: Models.PathLeaseResponse;
    switch (xMsLeaseAction) {
      case Models.PathLeaseAction.Acquire:
        await this.aquireLease(options, context);
        response = { statusCode: 201, leaseId: options.proposedLeaseId };
        break;
      case Models.PathLeaseAction.Break:
        await this.breakLease(options, context);
        response = {
          statusCode: 202,
          leaseTime: `${options.xMsLeaseBreakPeriod}`
        };
      case Models.PathLeaseAction.Change:
        await this.changeLease(options, context);
        response = { statusCode: 200, leaseId: options.proposedLeaseId };
        break;
      case Models.PathLeaseAction.Renew:
        await this.renewLease(options, context);
        response = { statusCode: 200, leaseId: options.proposedLeaseId };
        break;
      case Models.PathLeaseAction.Release:
        await this.releaseLease(options, context, false);
        response = { statusCode: 200, leaseId: options.proposedLeaseId };
        break;
    }

    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const blobModel: BlobModel = await this.metadataStore.downloadBlob(
      context,
      account,
      container,
      blob,
      ""
    );
    response.date = context.startTime;
    response.requestId = context.contextId;
    response.eTag = blobModel?.properties.etag;
    return response;
  }

  async read(
    options: Models.PathReadOptionalParams,
    context: Context
  ): Promise<Models.PathReadResponse> {
    if (options.rangeGetContentCRC64 && options.rangeGetContentMD5) {
      throw StorageErrorFactory.getInvalidInput(
        context,
        "rangeGetContentCRC64 and rangeGetContentCRC64 can't be both set at the same time"
      );
    }

    context.context.blob = removeSlash(context.context.blob);
    const res = await this.blobHandler.download(
      options,
      context
    );

    const response: Models.PathReadResponse = {
      ...res,
      resourceType: "file"
    };

    return response;
  }
  async setProperties(
    options: Models.PathSetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.PathSetPropertiesResponse> {
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blobName = removeSlash(blobCtx.blob!);
    const model = await this.metadataStore.downloadBlob(
      context,
      account,
      container,
      blobName,
      undefined,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );
    model.properties.cacheControl = options.pathHTTPHeaders?.cacheControl;
    model.properties.contentDisposition =
      options.pathHTTPHeaders?.contentDisposition;
    model.properties.contentEncoding =
      options.pathHTTPHeaders?.contentEncoding;
    model.properties.contentLanguage =
      options.pathHTTPHeaders?.contentLanguage;
    model.properties.contentType = options.pathHTTPHeaders?.contentType;
    model.properties.contentMD5 = options.pathHTTPHeaders?.contentMD5;
    //FIXME:
    // model.properties.properties = options.properties;
    if (options.permissions) {
      const permissions = toPermissions(options.permissions);

      if (permissions === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context);
      }

      model.permissions = toPermissionsString(permissions);
    }

    this.metadataStore.createBlob(
      context,
      model,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.PathSetPropertiesResponse = {
      statusCode: 200,
      cacheControl: options.pathHTTPHeaders?.cacheControl,
      contentDisposition: options.pathHTTPHeaders?.contentDisposition,
      contentEncoding: options.pathHTTPHeaders?.contentEncoding,
      contentLanguage: options.pathHTTPHeaders?.contentLanguage,
      contentType: options.pathHTTPHeaders?.contentType,
      contentMD5: options.pathHTTPHeaders?.contentMD5,
      properties: options.properties,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      date: context.startTime,
      eTag: model.properties.etag,
      lastModified: model.properties.lastModified,
      contentLength: model.properties.contentLength,
      version: DATA_LAKE_API_VERSION
    };

    return response;
  }

  async getProperties(
    options: Models.PathGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.PathGetPropertiesResponse> {
    context.context.blob = removeSlash(context.context.blob);
    const res = await this.blobHandler.getProperties(
      options,
      context
    );
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const model = await this.metadataStore.downloadBlob(
      context,
      account,
      container,
      blobName,
      options.snapshot,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.PathGetPropertiesResponse = res;
    response.metadata = model.metadata;
    if (!model.isDirectory) {
      response.resourceType = "file";
      response.blobCommittedBlockCount =
        model.properties.blobType === Models.BlobType.AppendBlob
          ? (model.committedBlocksInOrder || []).length
          : undefined;
    } else {
      response.resourceType = "directory";
      if (response.metadata) {
        response.metadata.hdi_isfolder = "true";
      } else {
        response.metadata = { hdi_isfolder: "true" };
      }
    }

    if (
      options.action === Models.PathGetPropertiesAction.GetAccessControl
    ) {
      response.owner = model.owner || DEFAULT_OWNER;
      response.group = model.group || DEFAULT_GROUP;
      response.permissions = model.permissions || DEFAULT_FILE_PERMISSIONS;
      if (response.permissions || !model.acl) {
        response.aCL = permissionsStringToAclString(response.permissions);
      } else {
        response.aCL = model.acl;
      }
    }

    return response;
  }

  async delete(
    options: Models.PathDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.PathDeleteResponse> {
    const recursive = options.recursive || false;
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = removeSlash(blobCtx.blob!);

    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const model = await this.metadataStore.getModel(
      context,
      accountName,
      containerName,
      blobName,
      false,
      options.leaseAccessConditions,
      options.modifiedAccessConditions,
      false
    );

    if (model === undefined) {
      throw StorageErrorFactory.getBlobNotFound(context);
    }

    if (!model.isDirectory) {
      await this.metadataStore.deleteBlob(
        context,
        accountName,
        containerName,
        blobName,
        options
      );
    } else {
      await this.metadataStore.deleteDirectory(
        context,
        accountName,
        containerName,
        blobName,
        recursive,
        options
      );
    }

    //hack since Blob_Delete return 202 but Path_Delete return 200
    const accept = context.request?.getHeader("Accept");
    const statusCode =
      accept !== undefined && accept.toLowerCase().includes("xml")
        ? 202
        : 200;
    const response: Models.PathDeleteResponse = {
      statusCode,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      version: DATA_LAKE_API_VERSION,
      date: context.startTime
    };

    return response;
  }

  async setAccessControl(
    options: Models.PathSetAccessControlOptionalParams,
    context: Context
  ): Promise<Models.PathSetAccessControlResponse> {
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blobName = removeSlash(blobCtx.blob!);
    const model = await this.metadataStore.downloadBlob(
      context,
      account,
      container,
      blobName,
      undefined,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );
    if (options.owner) model.owner = options.owner;
    if (options.group) model.group = options.group;

    checkPermissionAclConflict(context, options);

    if (options.permissions) {
      const permissions = toPermissions(options.permissions);
      if (permissions === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context);
      }
      model.permissions = options.permissions;
    }

    if (options.acl) {
      const acl = toAcl(options.acl);
      if (acl === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context);
      }

      model.acl = options.acl;
    }

    await this.metadataStore.createBlob(
      context,
      model,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.PathSetAccessControlResponse = {
      statusCode: 200,
      requestId: context.contextId,
      clientRequestId: options.requestId,
      date: context.startTime,
      eTag: model.properties.etag,
      lastModified: model.properties.lastModified,
      version: DATA_LAKE_API_VERSION
    };

    return response;
  }

  async setAccessControlRecursive(
    mode: Models.PathSetAccessControlRecursiveMode,
    options: Models.PathSetAccessControlRecursiveOptionalParams,
    context: Context
  ): Promise<Models.PathSetAccessControlRecursiveResponse> {
    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blobName = removeSlash(blobCtx.blob!);
    let directoriesSuccessful = 0;
    let failedEntries: Models.AclFailedEntry[] = [];
    let filesSuccessful = 0;
    let failureCount = 0;
    switch (mode) {
      case Models.PathSetAccessControlRecursiveMode.Set:
        const [paths] = await this.metadataStore.listPaths(
          context,
          account,
          container,
          blobName,
          true,
          options
        );

        paths.forEach(async (path) => {
          try {
            await this.setAccessControl(options, blobCtx);
            path.isDirectory ? directoriesSuccessful++ : filesSuccessful++;
          } catch (err) {
            failedEntries.push({
              name: path.name,
              type: err.errorCode,
              errorMessage: err.errorMessage
            });
            failureCount++;
          }
        });
        break;
      case Models.PathSetAccessControlRecursiveMode.Modify:
      case Models.PathSetAccessControlRecursiveMode.Remove:
        throw new NotImplementedError(context);
    }

    const response: Models.PathSetAccessControlRecursiveResponse = {
      statusCode: 200,
      clientRequestId: options.requestId,
      requestId: context.contextId,
      date: context.startTime,
      version: DATA_LAKE_API_VERSION,
      directoriesSuccessful,
      failedEntries,
      failureCount,
      filesSuccessful
    };
    return response;
  }

  private uncommittedBlocks: Map<string, string[]> = new Map<
    string,
    string[]
  >();

  async flushData(
    options: Models.PathFlushDataOptionalParams,
    context: Context
  ): Promise<Models.PathFlushDataResponse> {
    await this.aquireLease(options, context);
    await this.renewLease(options, context);

    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blobName = removeSlash(blobCtx.blob!);
    const model = await this.metadataStore.downloadBlob(
      context,
      account,
      container,
      blobName,
      undefined,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );
    model.properties = {
      ...model.properties,
      cacheControl:
        options.pathHTTPHeaders?.cacheControl ||
        model.properties.cacheControl,
      contentDisposition:
        options.pathHTTPHeaders?.contentDisposition ||
        model.properties.contentDisposition,
      contentEncoding:
        options.pathHTTPHeaders?.contentEncoding ||
        model.properties.contentEncoding,
      contentLanguage:
        options.pathHTTPHeaders?.contentLanguage ||
        model.properties.contentLanguage,
      //TODO: need to be validated first
      // contentMD5: options.pathHTTPHeaders?.contentMD5 || blobModel.properties.contentMD5,
      contentType:
        options.pathHTTPHeaders?.contentType || model.properties.contentType
    };

    this.metadataStore.createBlob(
      context,
      model,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const key = getKey(model);
    let blocks: { blockName: string; blockCommitType: string }[];
    if (this.uncommittedBlocks.has(key)) {
      blocks = this.uncommittedBlocks.get(key)!.map((blockName) => {
        return {
          blockName,
          blockCommitType: "uncommitted"
        };
      });

      await this.metadataStore.flush(
        context,
        model,
        blocks!,
        options.leaseAccessConditions,
        options.modifiedAccessConditions
      );

      this.uncommittedBlocks.delete(key);
    }

    await this.releaseLease(options, context, false);
    return {
      statusCode: 200,
      version: DATA_LAKE_API_VERSION,
      clientRequestId: options.requestId,
      requestId: context.contextId,
      date: context.startTime,
      contentLength: options.contentLength,
      eTag: model.properties.etag,
      lastModified: model.properties.lastModified,
      isServerEncrypted: model.properties.serverEncrypted
    };
  }

  async appendData(
    body: NodeJS.ReadableStream,
    options: Models.PathAppendDataOptionalParams,
    context: Context
  ): Promise<Models.PathAppendDataResponse> {
    await this.aquireLease(options, context);
    await this.renewLease(options, context);

    const contentLength = options.contentLength!;
    if (contentLength > MAX_APPEND_BLOB_BLOCK_SIZE) {
      throw StorageErrorFactory.getRequestEntityTooLarge(context);
    }

    if (contentLength === 0) {
      throw StorageErrorFactory.getInvalidHeaderValue(context, {
        HeaderName: HeaderConstants.CONTENT_LENGTH,
        HeaderValue: "0"
      });
    }

    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blobName = removeSlash(blobCtx.blob!);
    const blob = await this.metadataStore.downloadBlob(
      context,
      account,
      container,
      blobName,
      undefined,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const committedBlockCount = (blob.committedBlocksInOrder || []).length;
    if (committedBlockCount >= MAX_APPEND_BLOB_BLOCK_COUNT) {
      throw StorageErrorFactory.getBlockCountExceedsLimit(context);
    }

    // Persist content
    const extent = await this.extentStore.appendExtent(
      body,
      context.contextId
    );
    if (extent.count !== contentLength) {
      throw StorageErrorFactory.getInvalidOperation(
        context,
        `The size of the request body ${extent.count} mismatches the content-length ${contentLength}.`
      );
    }

    // MD5
    const contentMD5 = context.request!.getHeader(
      HeaderConstants.CONTENT_MD5
    );
    let contentMD5Buffer;
    let contentMD5String;

    if (contentMD5 !== undefined) {
      contentMD5Buffer =
        typeof contentMD5 === "string"
          ? Buffer.from(contentMD5, "base64")
          : contentMD5;
      contentMD5String =
        typeof contentMD5 === "string"
          ? contentMD5
          : contentMD5Buffer.toString("base64");

      const stream = await this.extentStore.readExtent(
        extent,
        context.contextId
      );
      const calculatedContentMD5Buffer = await getMD5FromStream(stream);
      const calculatedContentMD5String = Buffer.from(
        calculatedContentMD5Buffer
      ).toString("base64");

      if (contentMD5String !== calculatedContentMD5String) {
        throw StorageErrorFactory.getMd5Mismatch(
          context,
          contentMD5String,
          calculatedContentMD5String
        );
      }
    }

    const key = getKey(blob);
    const blockName = getUniqueName("block");
    await this.metadataStore.appendData(
      context,
      {
        accountName: blob.accountName,
        containerName: blob.containerName,
        blobName: blob.name,
        isCommitted: false,
        name: blockName,
        size: extent.count,
        persistency: extent
      },
      options.leaseAccessConditions
    );

    if (!this.uncommittedBlocks.has(key)) {
      this.uncommittedBlocks.set(key, [blockName]);
    } else {
      this.uncommittedBlocks.get(key)?.push(blockName);
    }

    const response: Models.PathAppendDataResponse = {
      statusCode: 202,
      eTag: blob.properties.etag,
      contentMD5: contentMD5Buffer,
      xMsContentCrc64: undefined,
      clientRequestId: options.requestId,
      version: DATA_LAKE_API_VERSION,
      date: context.startTime,
      requestId: context.contextId,
      isServerEncrypted: true
    };

    if (options.flush) {
      await this.flushData(options, context);
    } else {
      await this.releaseLease(options, context, true);
    }
    return response;
  }

  async setExpiry(
    expiryOptions: Models.PathExpiryOptions,
    options: Models.PathSetExpiryOptionalParams,
    context: Context
  ): Promise<Models.PathSetExpiryResponse> {
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
      expiryOptions !== Models.PathExpiryOptions.NeverExpire
    ) {
      throw StorageErrorFactory.getMissingRequestHeader(context);
    }
    let expiresOn: Date | undefined;
    let timeToExpireInMs;
    let startDate = date;
    switch (expiryOptions) {
      case Models.PathExpiryOptions.NeverExpire:
        expiresOn = undefined;
        break;
      case Models.PathExpiryOptions.RelativeToCreation:
        startDate = new Date(blobModel.properties.creationTime!);
      case Models.PathExpiryOptions.RelativeToNow:
        timeToExpireInMs = parseInt(options.expiresOn!);
        if (isNaN(timeToExpireInMs)) {
          throw StorageErrorFactory.getInvalidHeaderValue(context);
        }
        expiresOn = new Date(startDate.getTime() + timeToExpireInMs);
        break;
      case Models.PathExpiryOptions.Absolute:
        expiresOn = new Date(options.expiresOn!);
        break;
    }

    blobModel.properties.expiresOn = expiresOn;
    await this.metadataStore.createBlob(context, blobModel);

    const response: Models.PathSetExpiryResponse = {
      statusCode: 200,
      clientRequestId: options.requestId,
      requestId: context.contextId,
      date,
      eTag: blobModel.properties.etag,
      lastModified: blobModel.properties.lastModified
    };

    return response;
  }

  undelete(
    options: Models.PathUndeleteOptionalParams,
    context: Context
  ): Promise<Models.PathUndeleteResponse> {
    throw new NotImplementedError(context);
  }

  private async createBlob(
    options: Models.PathCreateOptionalParams,
    context: Context
  ): Promise<Models.PathCreateResponse> {
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;
    const date = context.startTime!;
    const etag = newEtag();
    const contentLength = parseInt(
      context.request!.getHeader("content-length") || "-1"
    );

    if (contentLength !== 0 && !this.loose) {
      throw StorageErrorFactory.getInvalidOperation(
        context,
        "Content-Length must be 0 for Create Append Blob request."
      );
    }

    checkPermissionAclConflict(context, options);

    const permissions = toPermissions(
      options.permissions || DEFAULT_FILE_PERMISSIONS,
      options.umask || DEFAULT_UMMASK
    );

    if (permissions === undefined) {
      throw StorageErrorFactory.getInvalidHeaderValue(context);
    }

    const acl = toAcl(options.acl);

    if (acl === undefined) {
      throw StorageErrorFactory.getInvalidHeaderValue(context);
    }

    let expiresOn: Date | undefined;
    if (options.expiresOn) {
      const timeToExpireInMs = parseInt(options.expiresOn);
      if (isNaN(timeToExpireInMs)) {
        expiresOn = new Date(options.expiresOn);
        expiresOn.setMilliseconds(0);
      } else {
        expiresOn = new Date(date.getTime() + timeToExpireInMs);
      }
    }

    const contentType =
      options.pathHTTPHeaders?.contentType ||
      context.request!.getHeader("content-type") ||
      "application/octet-stream";

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
        contentLength: 0,
        contentType,
        expiresOn,
        contentEncoding: options.pathHTTPHeaders?.contentEncoding,
        contentLanguage: options.pathHTTPHeaders?.contentLanguage,
        contentMD5: options.pathHTTPHeaders?.contentMD5,
        contentDisposition: options.pathHTTPHeaders?.contentDisposition,
        cacheControl: options.pathHTTPHeaders?.cacheControl,
        accessTier: Models.AccessTier.Hot,
        accessTierInferred: true,
        blobType: Models.BlobType.AppendBlob,
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        serverEncrypted: true
      },
      snapshot: "",
      isCommitted: true,
      isDirectory: false,
      permissions: toPermissionsString(permissions),
      acl: toAclString(acl),
      owner: options.owner || DEFAULT_OWNER,
      group: options.group || DEFAULT_GROUP,
      committedBlocksInOrder: []
    };

    this.setAdvancedOptions(blob, options, context);

    await this.metadataStore.createBlob(
      context,
      blob,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const response: Models.PathCreateResponse = {
      statusCode: 201,
      eTag: etag,
      lastModified: blob.properties.lastModified,
      // contentMD5: blob.properties.contentMD5,
      requestId: context.contextId,
      version: DATA_LAKE_API_VERSION,
      date,
      isServerEncrypted: true,
      contentLength: 0
      // clientRequestId: options.requestId
    };

    const originalBlob = blobCtx.originalBlob!;
    const idx = originalBlob.lastIndexOf("/");
    if (idx < 0) return response;
    const dir = originalBlob.substring(0, idx);
    options.modifiedAccessConditions = {};
    await this.createSpecificDirectory(options, context, dir, true);

    return response;
  }

  private async createDirectory(
    options: Models.PathCreateOptionalParams,
    context: Context
  ): Promise<Models.PathCreateResponse> {
    const blobCtx = new DataLakeContext(context);
    const blob = blobCtx.blob!;
    const recursive: boolean =
      context.request?.getQuery("recursive") === "true" || true;
    return await this.createSpecificDirectory(
      options,
      context,
      blob,
      recursive,
      options.metadata
    );
  }
  private async createSpecificDirectory(
    options: Models.PathCreateOptionalParams,
    context: Context,
    dir: string,
    recursive: boolean,
    metadata?: { [propertyName: string]: string }
  ): Promise<Models.PathCreateResponse> {
    if (options.expiresOn) {
      throw StorageErrorFactory.getInvalidInput(
        context,
        "Set Expiry is not supported for a directory"
      );
    }

    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const date = context.startTime!;
    const etag = newEtag();
    let leaseAccessConditions = options.leaseAccessConditions;
    let modifiedAccessConditions = options.modifiedAccessConditions;
    await this.metadataStore.checkContainerExist(
      context,
      account,
      container
    );

    let curDir = dir.endsWith("/") ? dir.substring(0, dir.length - 1) : dir;
    let parentDir;
    do {
      const curDirDecoded = decodeURIComponent(curDir);
      const idx = curDir.lastIndexOf("/");
      parentDir = idx < 0 ? "" : curDir.substring(0, idx);
      const dirModel = await this.metadataStore.getModel(
        context,
        account,
        container,
        curDirDecoded,
        false,
        leaseAccessConditions,
        modifiedAccessConditions,
        false
      );

      if (
        dirModel &&
        modifiedAccessConditions &&
        modifiedAccessConditions.ifNoneMatch === "*"
      ) {
        throw StorageErrorFactory.getBlobAlreadyExists(context);
      }

      const permissions = toPermissions(
        options.permissions || DEFAULT_DIR_PERMISSIONS,
        options.umask || DEFAULT_UMMASK
      );

      if (permissions === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context);
      }

      const acl = toAcl(options.acl);

      if (acl === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context);
      }

      const newDirModel: BlobModel = {
        deleted: false,
        accountName: account,
        containerName: container,
        name: curDirDecoded,
        properties: {
          creationTime: date,
          lastModified: date,
          etag,
          blobType: Models.BlobType.BlockBlob,
          serverEncrypted: true,
          accessTier: Models.AccessTier.Hot,
          accessTierInferred: true,
          accessTierChangeTime: date,
          cacheControl: options.pathHTTPHeaders?.cacheControl,
          contentEncoding: options.pathHTTPHeaders?.contentEncoding,
          contentLanguage: options.pathHTTPHeaders?.contentLanguage,
          contentDisposition: options.pathHTTPHeaders?.contentDisposition,
          contentType: options.pathHTTPHeaders?.contentType
        },
        isCommitted: true,
        isDirectory: true,
        snapshot: "",
        metadata,
        owner: options.owner || DEFAULT_OWNER,
        group: options.group || DEFAULT_OWNER,
        permissions: toPermissionsString(permissions),
        acl: toAclString(acl)
      };

      this.setAdvancedOptions(newDirModel, options, context);

      await this.metadataStore.createBlob(
        context,
        newDirModel,
        leaseAccessConditions,
        modifiedAccessConditions
      );

      if (parentDir === "") break;
      curDir = parentDir;
      //Conditions are only valid for base directory
      modifiedAccessConditions = {};
      leaseAccessConditions = {};
    } while (recursive);

    const response: Models.PathCreateResponse = {
      statusCode: 201,
      date,
      eTag: etag,
      lastModified: date,
      requestId: options.requestId,
      version: DATA_LAKE_API_VERSION,
      contentLength: 0,
      isServerEncrypted: true
    };

    return response;
  }

  private async rename(
    options: Models.PathCreateOptionalParams,
    context: Context
  ): Promise<Models.PathCreateResponse> {
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const targetContainer = blobCtx.container!;
    const target = blobCtx.blob!;

    let renameSource = url.parse(options.renameSource!).pathname!;
    if (renameSource.startsWith("/")) renameSource = renameSource.substring(1);
    if (renameSource.startsWith(accountName + "/")) {
      renameSource = renameSource.substring(accountName.length + 1);
    }
    const idx = renameSource.indexOf("/");
    const renameSourceContainer = renameSource.substring(0, idx);
    renameSource = decodeURIComponent(renameSource.substring(idx + 1));

    const model = await this.metadataStore.getModel(
      context,
      accountName,
      renameSourceContainer,
      renameSource,
      true,
      undefined, //we don't send options.leaseAccessConditions    since they are for target not source
      undefined, //we don't send options.modifiedAccessConditions since they are for target not source
      false
    );
    const renameFunc = model.isDirectory
      ? this.metadataStore.renameDirectory
      : this.metadataStore.renameBlob;
    const newModel = await renameFunc.call(
      this.metadataStore,
      context,
      accountName,
      renameSourceContainer,
      renameSource,
      targetContainer,
      target,
      options
    );

    const response: Models.PathCreateResponse = {
      statusCode: 201,
      eTag: newModel.properties.etag,
      lastModified: newModel.properties.lastModified,
      requestId: context.contextId,
      version: DATA_LAKE_API_VERSION,
      contentLength: 0, // we don't sent a body so we must send contentLength to 0
      isServerEncrypted: newModel.properties.serverEncrypted,
      date: context.startTime
    };

    return response;
  }

  private setAdvancedOptions(
    model: BlobModel,
    options: Models.PathCreateOptionalParams,
    context: Context
  ): void {
    if (options.proposedLeaseId) {
      model.leaseId = options.proposedLeaseId;
      model.properties.leaseStatus = Models.LeaseStatusType.Locked;
      model.properties.leaseState = Models.LeaseStateType.Leased;
      if (options.leaseDuration === -1) {
        model.properties.leaseDuration = Models.LeaseDurationType.Infinite;
      } else if (options.leaseDuration! < 15 || options.leaseDuration! > 60) {
        throw StorageErrorFactory.getInvalidHeaderValue(context);
      } else {
        model.properties.leaseDuration = Models.LeaseDurationType.Fixed;
        model.leaseDurationSeconds = options.leaseDuration;
        model.leaseExpireTime = new Date(
          context.startTime!.getTime() + options.leaseDuration! * 1000
        );
      }
    }
  }

  private async aquireLease(
    options:
      | Models.PathAppendDataOptionalParams
      | Models.PathFlushDataOptionalParams
      | Models.PathLeaseOptionalParams,
    context: Context
  ): Promise<void> {
    if (
      "leaseAction" in options &&
      options.leaseAction !== Models.LeaseAction.Acquire &&
      options.leaseAction !== Models.LeaseAction.AcquireRelease
    )
      return;

    if (options.proposedLeaseId === undefined) {
      throw StorageErrorFactory.getLeaseNotPresentWithLeaseOperation(context);
    }
    options.leaseAccessConditions! ||= {};

    if (options.leaseAccessConditions.leaseId !== undefined) {
      throw StorageErrorFactory.getInvalidHeaderValue(context);
    }

    options.leaseAccessConditions.leaseId = options.proposedLeaseId;

    if (options.xMsLeaseDuration === undefined) {
      throw StorageErrorFactory.getMissingRequestHeader(context);
    }

    if (options.leaseAccessConditions.leaseId === undefined) {
      throw StorageErrorFactory.getLeaseNotPresentWithLeaseOperation(context);
    }

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

    await this.metadataStore.acquireBlobLease(
      context,
      account,
      container,
      blob,
      options.xMsLeaseDuration,
      options.leaseAccessConditions.leaseId,
      options
    );
  }

  private async releaseLease(
    options:
      | Models.PathAppendDataOptionalParams
      | Models.PathFlushDataOptionalParams
      | Models.PathLeaseOptionalParams,
    context: Context,
    isAppend: boolean
  ): Promise<void> {
    if (
      "leaseAction" in options &&
      options.leaseAction !== Models.LeaseAction.Release &&
      options.leaseAction !== Models.LeaseAction.AcquireRelease
    )
      return;

    //https://learn.microsoft.com/en-us/rest/api/storageservices/datalakestoragegen2/path/update
    //Starting with version 2020-08-04 ... 'Release' action is only supported in flush operation.
    //but need it in case of skipApiVersion or loose
    // if (isAppend && options.leaseAction === Models.LeaseAction.Release) {
    //   throw StorageErrorFactory.getInvalidHeaderValue(context);
    // }

    options.leaseAccessConditions! ||= {};
    if (options.leaseAccessConditions.leaseId === undefined) {
      throw StorageErrorFactory.getMissingRequestHeader(context);
    }

    const blobCtx = new DataLakeContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    await this.metadataStore.releaseBlobLease(
      context,
      account,
      container,
      blob,
      options.leaseAccessConditions.leaseId,
      options
    );
  }

  private async renewLease(
    options:
      | Models.PathAppendDataOptionalParams
      | Models.PathFlushDataOptionalParams
      | Models.PathLeaseOptionalParams,
    context: Context
  ): Promise<void> {
    if (
      "leaseAction" in options &&
      options.leaseAction !== Models.LeaseAction.Renew &&
      options.leaseAction !== Models.LeaseAction.AutoRenew
    )
      return;

    options.leaseAccessConditions! ||= {};
    if (options.leaseAccessConditions.leaseId === undefined) {
      throw StorageErrorFactory.getLeaseNotPresentWithLeaseOperation(context);
    }

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

    await this.metadataStore.renewBlobLease(
      context,
      account,
      container,
      blob,
      options.leaseAccessConditions.leaseId,
      options
    );
  }

  private async breakLease(
    options: Models.PathLeaseOptionalParams,
    context: Context
  ) {
    options.leaseAccessConditions! ||= {};

    if (options.xMsLeaseBreakPeriod === undefined) {
      throw StorageErrorFactory.getMissingRequestHeader(context);
    }

    if (options.leaseAccessConditions.leaseId === undefined) {
      throw StorageErrorFactory.getLeaseNotPresentWithLeaseOperation(context);
    }

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

    await this.metadataStore.breakBlobLease(
      context,
      account,
      container,
      blob,
      options.xMsLeaseBreakPeriod,
      options
    );
  }

  private async changeLease(
    options: Models.PathLeaseOptionalParams,
    context: Context
  ) {
    if (options.proposedLeaseId === undefined) {
      throw StorageErrorFactory.getLeaseNotPresentWithLeaseOperation(context);
    }
    options.leaseAccessConditions! ||= {};
    if (options.xMsLeaseDuration === undefined) {
      throw StorageErrorFactory.getMissingRequestHeader(context);
    }

    if (options.leaseAccessConditions.leaseId === undefined) {
      throw StorageErrorFactory.getLeaseNotPresentWithLeaseOperation(context);
    }

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

    await this.metadataStore.changeBlobLease(
      context,
      account,
      container,
      blob,
      options.leaseAccessConditions.leaseId,
      options.proposedLeaseId,
      options
    );
  }
}

function checkPermissionAclConflict(
  context: Context,
  options: Models.PathSetAccessControlOptionalParams
) {
  if (options.permissions && options.acl) {
    throw StorageErrorFactory.getInvalidInput(
      context,
      "Permissions and Acl can't be both set at the same time"
    );
  }
}
function getKey(model: BlobModel) {
  return `${model.accountName}/${model.containerName}/${model.name}`;
}
