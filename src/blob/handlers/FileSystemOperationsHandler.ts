import BaseHandler from "./BaseHandler";
import IFileSystemOperationsHandler from "../generated/handlers/IFileSystemOperationsHandler";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import BlobStorageContext from "../context/BlobStorageContext";
import { DATA_LAKE_API_VERSION } from "../utils/constants";
import ContainerHandler from "./ContainerHandler";
import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import { OAuthLevel } from "../../common/models";
import IExtentStore from "../../common/persistence/IExtentStore";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import NotImplementedError from "../errors/NotImplementedError";
/**
 * FileSystemOperationsHandler handles Azure Storage DataLake Gen2 filesystem
 *
 * @export
 * @class FileSystemOperationsHandler
 * @extends {BaseHandler}
 * @implements {IBlobHandler}
 */
export default class FileSystemOperationsHandler
  extends BaseHandler
  implements IFileSystemOperationsHandler
{
  private readonly containerHandler = new ContainerHandler(
    this.accountDataStore,
    this.oauth,
    this.metadataStore,
    this.extentStore,
    this.logger,
    this.loose
  );

  constructor(
    private readonly accountDataStore: IAccountDataStore,
    private readonly oauth: OAuthLevel | undefined,
    metadataStore: IBlobMetadataStore,
    extentStore: IExtentStore,
    logger: ILogger,
    loose: boolean
  ) {
    super(metadataStore, extentStore, logger, loose);
  }

  create(
    options: Models.FileSystemCreateOptionalParams,
    context: Context
  ): Promise<Models.FileSystemCreateResponse> {
    throw new NotImplementedError(context.contextId);
  }

  setProperties(
    options: Models.FileSystemSetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.FileSystemSetPropertiesResponse> {
    throw new NotImplementedError(context.contextId);
  }

  async getProperties(
    options: Models.FileSystemGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.FileSystemGetPropertiesResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const containerProperties = await this.metadataStore.getContainerProperties(
      context,
      accountName,
      containerName
    );

    const response: Models.FileSystemGetPropertiesResponse = {
      statusCode: 200,
      date: blobCtx.startTime,
      eTag: containerProperties.properties.etag,
      lastModified: containerProperties.properties.lastModified,
      requestId: options.requestId,
      version: DATA_LAKE_API_VERSION,
      namespaceEnabled: "true"
    };

    return response;
  }

  delete(
    options: Models.FileSystemDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.FileSystemDeleteResponse> {
    throw new NotImplementedError(context.contextId);
  }

  async listPaths(
    recursive: boolean,
    options: Models.FileSystemListPathsOptionalParams,
    context: Context
  ): Promise<Models.FileSystemListPathsResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const directory = options.path || "";

    const containerRes = await this.containerHandler.getProperties(
      options,
      context
    );

    const paths = await this.metadataStore.listPaths(
      context,
      accountName,
      containerName,
      directory,
      recursive,
      options
    );

    const response: Models.FileSystemListPathsResponse = {
      statusCode: 200,
      date: containerRes.date,
      eTag: containerRes.eTag,
      lastModified: containerRes.lastModified,
      requestId: containerRes.requestId,
      version: DATA_LAKE_API_VERSION,
      paths
    };

    return response;
  }

  listBlobHierarchySegment(
    options: Models.FileSystemListBlobHierarchySegmentOptionalParams,
    context: Context
  ): Promise<Models.FileSystemListBlobHierarchySegmentResponse> {
    throw new NotImplementedError(context.contextId);
  }
}
