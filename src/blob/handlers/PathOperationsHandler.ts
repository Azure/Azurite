import BaseHandler from "./BaseHandler";
import IPathOperationsHandler from "../generated/handlers/IPathOperationsHandler";
import {
  PathCreateResponse,
  PathReadResponse,
  PathGetPropertiesResponse,
  PathDeleteResponse,
  PathGetPropertiesAction
} from "../generated/artifacts/models";
import Context from "../generated/Context";
import BlobStorageContext from "../context/BlobStorageContext";
import { BLOB_API_VERSION, DATA_LAKE_API_VERSION } from "../utils/constants";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import IBlobMetadataStore, {
  DirectoryModel
} from "../persistence/IBlobMetadataStore";
import * as Models from "../generated/artifacts/models";
import os from "os";
import IExtentStore from "../../common/persistence/IExtentStore";
import ILogger from "../../common/ILogger";
import IBlobHandler from "../generated/handlers/IBlobHandler";
import BlobHandler from "./BlobHandler";
import IPageBlobRangesManager from "./IPageBlobRangesManager";
import IAppendBlobHandler from "../generated/handlers/IAppendBlobHandler";
import AppendBlobHandler from "./AppendBlobHandler";
import NotImplementedError from "../errors/NotImplementedError";
import { newEtag } from "../../common/utils/utils";
import { exec } from "child_process";
import { Readable } from "stream";

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
    metadataStore: IBlobMetadataStore,
    extentStore: IExtentStore,
    logger: ILogger,
    loose: boolean,
    pageBlobRangesManager: IPageBlobRangesManager,
    private readonly blobHandler: IBlobHandler = new BlobHandler(
      metadataStore,
      extentStore,
      logger,
      loose,
      pageBlobRangesManager
    ),
    private readonly appendBlobHandler: IAppendBlobHandler = new AppendBlobHandler(
      metadataStore,
      extentStore,
      logger,
      loose
    )
  ) {
    super(metadataStore, extentStore, logger, loose);
  }

  async create(
    options: Models.PathCreateOptionalParams,
    context: Context
  ): Promise<Models.PathCreateResponse> {
    const body = context.request?.getBodyStream();

    if (!body) {
      throw StorageErrorFactory.getInvalidQueryParameterValue(
        "body is not set"
      );
    }

    if (options.resource === "file") {
      return await this.createBlob(options, context);
    } else if (options.resource === "directory") {
      return await this.createDirectory(options, context);
    } else if (options.renameSource) {
      return await this.rename(options, context);
    } else {
      throw StorageErrorFactory.getInvalidQueryParameterValue(
        "resource must be set to either 'file' or 'directory' or renameSource is set"
      );
    }
  }

  update(
    action: Models.PathUpdateAction,
    mode: Models.PathSetAccessControlRecursiveMode,
    body: NodeJS.ReadableStream,
    options: Models.PathUpdateOptionalParams,
    context: Context
  ): Promise<Models.PathUpdateResponse> {
    throw new NotImplementedError(context.contextId);
  }

  lease(
    xMsLeaseAction: Models.PathLeaseAction,
    options: Models.PathLeaseOptionalParams,
    context: Context
  ): Promise<Models.PathLeaseResponse> {
    throw new NotImplementedError(context.contextId);
  }

  async read(
    options: Models.PathReadOptionalParams,
    context: Context
  ): Promise<Models.PathReadResponse> {
    const downloadOptions: Models.BlobDownloadOptionalParams = {
      ...options
    };

    let response: PathReadResponse;
    try {
      const res = await this.blobHandler.download(
        downloadOptions,
        context
      );

      response = {
        ...res,
        contentMD5: undefined,
        version: DATA_LAKE_API_VERSION,
        resourceType: "file"
      };
    } catch (err) {
      const blobCtx = new BlobStorageContext(context);
      const account = blobCtx.account!;
      const container = blobCtx.container!;
      const directory = blobCtx.blob!;

      const res = await this.metadataStore.getDirectory(context, account, container, directory);
      response = {
        statusCode: 200,
        ...res,
        properties: undefined,
        contentMD5: undefined,
        contentLength: 0,
        contentRange: options.range,
        body: Readable.from([]),
        version: DATA_LAKE_API_VERSION,
        resourceType: "directory"
      };
    }

    return response;
  }

  async getProperties(
    options: Models.PathGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.PathGetPropertiesResponse> {
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;

    let model;
    let isDirectory: boolean;
    try {
      model = await this.metadataStore.getBlobProperties(
        context,
        account,
        container,
        blob,
        undefined,
        options.leaseAccessConditions,
        options.modifiedAccessConditions
      );

      isDirectory = false;
    } catch (err) {
      const dir = blob.endsWith("/")
        ? blob.substring(0, blob.length - 1)
        : blob;
      model = await this.metadataStore.getDirectory(
        context,
        account,
        container,
        dir
      );

      isDirectory = true;
    }

    const response: PathGetPropertiesResponse = {
      statusCode: 200,
      cacheControl: model.properties.cacheControl,
      contentDisposition: model.properties.contentDisposition,
      contentEncoding: model.properties.contentEncoding,
      contentLanguage: model.properties.contentLanguage,
      contentLength: model.properties.contentLength,
      contentType: model.properties.contentType,
      date: context.startTime,
      eTag: model.properties.etag,
      lastModified: model.properties.lastModified,
      requestId: context.contextId,
      version: DATA_LAKE_API_VERSION,
      resourceType: isDirectory ? "directory" : "file",
      leaseDuration: model.properties.leaseDuration,
      leaseState: model.properties.leaseState
    };
    if (isDirectory) response.metadata = { hdi_isfolder: "true" };
    if (options.action === PathGetPropertiesAction.GetAccessControl) {
      //TODO: save to model and get these properties from model;
      response.owner = os.userInfo().username;
      if (os.platform() !== "win32") {
        const {stdout, stderr} = await this.sh("id -gn");
        if (!stderr) {
          response.group = stdout.substring(0, stdout.length - 1); //remove trailing \n
        }
      }
      response.permissions = "rwxrwxr--";
      response.aCL = "user::rwx,group::rwx,other::r--,mask::rwx";
    }

    return response;
  }

  async delete(
    options: Models.PathDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.PathDeleteResponse> {
    const recursive = options.recursive || false;
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const blobName = blobCtx.blob!;

    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    try {
      await this.metadataStore.deleteBlob(
        context,
        accountName,
        containerName,
        blobName,
        options
      );
    } catch (err) {
      await this.metadataStore.deleteDirectory(
        context,
        accountName,
        containerName,
        blobName,
        recursive,
        options
      );
    } 

    const response: PathDeleteResponse = {
      statusCode: 200,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      date: context.startTime
    };

    return response;
  }

  setAccessControl(
    options: Models.PathSetAccessControlOptionalParams,
    context: Context
  ): Promise<Models.PathSetAccessControlResponse> {
    throw new NotImplementedError(context.contextId);
  }

  setAccessControlRecursive(
    mode: Models.PathSetAccessControlRecursiveMode,
    options: Models.PathSetAccessControlRecursiveOptionalParams,
    context: Context
  ): Promise<Models.PathSetAccessControlRecursiveResponse> {
    throw new NotImplementedError(context.contextId);
  }

  async flushData(
    options: Models.PathFlushDataOptionalParams,
    context: Context
  ): Promise<Models.PathFlushDataResponse> {
    //NO-OP since we write with append anyway.
    return { statusCode: 200 };
  }

  async appendData(
    body: NodeJS.ReadableStream,
    options: Models.PathAppendDataOptionalParams,
    context: Context
  ): Promise<Models.PathAppendDataResponse> {
    const appendOptions: Models.BlockBlobUploadOptionalParams = {
      ...options,
      blobHTTPHeaders: {
        blobCacheControl: options.pathHTTPHeaders?.cacheControl,
        blobContentDisposition: options.pathHTTPHeaders?.contentDisposition,
        blobContentEncoding: options.pathHTTPHeaders?.contentEncoding,
        blobContentLanguage: options.pathHTTPHeaders?.contentLanguage,
        blobContentType: options.pathHTTPHeaders?.contentType,
        blobContentMD5: options.pathHTTPHeaders?.contentMD5
      }
    };

    const res = await this.appendBlobHandler.appendBlock(
      body,
      options.contentLength!,
      appendOptions,
      context
    );
    const response: Models.PathAppendDataResponse = {
      ...res,
      statusCode: 202
    };

    return response;
  }

  setExpiry(
    expiryOptions: Models.PathExpiryOptions,
    options: Models.PathSetExpiryOptionalParams,
    context: Context
  ): Promise<Models.PathSetExpiryResponse> {
    throw new NotImplementedError(context.contextId);
  }

  undelete(
    options: Models.PathUndeleteOptionalParams,
    context: Context
  ): Promise<Models.PathUndeleteResponse> {
    throw new NotImplementedError(context.contextId);
  }

  private async createBlob(
    options: Models.PathCreateOptionalParams,
    context: Context
  ): Promise<PathCreateResponse> {
    const date = context.startTime!;
    const contentLength = parseInt(
      context.request!.getHeader("content-length") || "-1"
    );

    const blobOptions: Models.BlockBlobUploadOptionalParams = {
      ...options,
      blobHTTPHeaders: {
        blobCacheControl: options.pathHTTPHeaders?.cacheControl,
        blobContentType: options.pathHTTPHeaders?.contentType,
        blobContentMD5: options.pathHTTPHeaders?.contentMD5,
        blobContentEncoding: options.pathHTTPHeaders?.contentEncoding,
        blobContentLanguage: options.pathHTTPHeaders?.contentLanguage,
        blobContentDisposition: options.pathHTTPHeaders?.contentDisposition
      }
    };

    const res = await this.appendBlobHandler.create(
      contentLength,
      blobOptions,
      context
    );

    const response: PathCreateResponse = {
      statusCode: 201,
      date,
      eTag: res.eTag,
      lastModified: date,
      requestId: options.requestId,
      version: DATA_LAKE_API_VERSION,
      contentLength: 0,
      isServerEncrypted: true
    };

    return response;
  }

  private async createDirectory(
    options: Models.PathCreateOptionalParams,
    context: Context
  ): Promise<Models.PathCreateResponse> {
    const blobCtx = new BlobStorageContext(context);
    const account = blobCtx.account!;
    const container = blobCtx.container!;
    const blob = blobCtx.blob!;
    const date = context.startTime!;
    const etag = newEtag();
    const recursive: boolean =
      context.request?.getQuery("recursive") === "true" || true;

    await this.metadataStore.checkContainerExist(context, account, container);

    let curDir = blob.endsWith("/") ? blob.substring(0, blob.length - 1) : blob;
    do {
      try {
        await this.metadataStore.getDirectory(
          context,
          account,
          container,
          curDir
        );
      } catch (err) {
        const dirModel: DirectoryModel = {
          accountName: account,
          containerName: container,
          name: curDir ,
          properties: {
            creationTime: date,
            lastModified: date,
            etag,
            contentLength: 0,
            blobType: Models.BlobType.BlockBlob,
            leaseStatus: Models.LeaseStatusType.Unlocked,
            leaseState: Models.LeaseStateType.Available,
            serverEncrypted: true,
            accessTier: Models.AccessTier.Hot,
            accessTierInferred: true,
            accessTierChangeTime: date
          },
          isCommitted: true,
          metadata: {}
        };

        await this.metadataStore.createDirectory(
          context,
          dirModel,
          options.leaseAccessConditions,
          options.modifiedAccessConditions
        );
      }

      const idx = curDir.lastIndexOf("/");
      if (idx < 0) break;
      curDir = curDir.substring(0, idx);
    } while (recursive);

    const response: PathCreateResponse = {
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
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const target = blobCtx.blob!;

    let renameSource = options.renameSource!;
    renameSource = decodeURIComponent(renameSource);
    if (renameSource.startsWith("/")) renameSource = renameSource.substring(1);
    const idx = renameSource.indexOf("/");
    const renameSourceContainer = renameSource.substring(0, idx);
    renameSource = renameSource.substring(idx + 1);

    let model;
    try {
      model = await this.metadataStore.renameBlob(
        context,
        accountName,
        renameSourceContainer,
        renameSource,
        containerName,
        target,
        options
      );
    } catch (err) {
      model = await this.metadataStore.renameDirectory(
        context,
        accountName,
        renameSourceContainer,
        renameSource,
        containerName,
        target,
        options
      );
    }

    const response: Models.PathCreateResponse = {
      statusCode: 201,
      eTag: model.properties.etag,
      lastModified: model.properties.lastModified,
      requestId: context.contextId,
      version: BLOB_API_VERSION,
      contentLength: model.properties.contentLength,
      isServerEncrypted: model.properties.serverEncrypted,
      date: context.startTime
    };

    return response;
  }

  /**
   * Execute simple shell command (async wrapper).
   * @param {string} cmd
   * @return {Object} { stdout: String, stderr: String }
   */
  private async sh(cmd: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise(function (resolve, reject) {
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          reject(err);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}
