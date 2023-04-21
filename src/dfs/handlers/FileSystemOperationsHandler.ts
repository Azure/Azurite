import { ContainerCreateResponse } from "../../blob/generated/artifacts/models";
import BlobContainerHandler from "../../blob/handlers/ContainerHandler";
import ILogger from "../../common/ILogger";
import IExtentStore from "../../common/persistence/IExtentStore";
import DataLakeContext from "../context/DataLakeContext";
import * as Models from "../generated/artifacts/models";
import Context from "../../blob/generated/Context";
import IFileSystemOperationsHandler from "../generated/handlers/IFileSystemOperationsHandler";
import IDataLakeMetaDataStore from "../persistence/IDataLakeMetadataStore";
import { DATA_LAKE_API_VERSION } from "../utils/constants";
import BaseHandler from "./BaseHandler";

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
  constructor(
    private readonly containerHandler: BlobContainerHandler,
    metadataStore: IDataLakeMetaDataStore,
    extentStore: IExtentStore,
    logger: ILogger,
    loose: boolean
  ) {
    super(metadataStore, extentStore, logger, loose);
  }

  async create(
    options: Models.FileSystemCreateOptionalParams,
    context: Context
  ): Promise<Models.FileSystemCreateResponse> {
    const res: ContainerCreateResponse = await this.containerHandler.create(
      options,
      context
    );

    const response: Models.FileSystemCreateResponse = {
      statusCode: 201,
      clientRequestId: options.requestId,
      eTag: res.eTag,
      lastModified: res.lastModified,
      date: context.startTime,
      version: DATA_LAKE_API_VERSION,
      namespaceEnabled: "true"
    };

    return response;
  }
  /**
   * Set prodperties of a filesystem/container
   *
   * @param {Models.FileSystemSetPropertiesOptionalParams} options
   * @param {Context} context
   * @return {*}  {Promise<Models.FileSystemSetPropertiesResponse>}
   * @memberof FileSystemOperationsHandler
   */
  async setProperties(
    options: Models.FileSystemSetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.FileSystemSetPropertiesResponse> {
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const res = await this.metadataStore.setContainerProperties(
      context,
      accountName,
      containerName,
      options.properties === undefined ? "" : options.properties,
      undefined,
      options.modifiedAccessConditions
    );

    const response: Models.FileSystemSetPropertiesResponse = {
      statusCode: 200,
      date: blobCtx.startTime,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      requestId: options.requestId,
      version: DATA_LAKE_API_VERSION
    };

    return response;
  }

  async getProperties(
    options: Models.FileSystemGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.FileSystemGetPropertiesResponse> {
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const res = await this.metadataStore.getContainerProperties(
      context,
      accountName,
      containerName
    );

    const response: Models.FileSystemGetPropertiesResponse = {
      statusCode: 200,
      date: blobCtx.startTime,
      eTag: res.properties.etag,
      lastModified: res.properties.lastModified,
      properties: res.fileSystemProperties,
      requestId: options.requestId,
      version: DATA_LAKE_API_VERSION,
      namespaceEnabled: "true"
    };

    return response;
  }

  async delete(
    options: Models.FileSystemDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.FileSystemDeleteResponse> {
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    // TODO: Mark container as being deleted status, then (mark) delete all blobs async
    // When above finishes, execute following delete container operation
    // Because following delete container operation will only delete DB metadata for container and
    // blobs under the container, but will not clean up blob data in disk
    // The current design will directly remove the container and all the blobs belong to it.
    await this.metadataStore.deleteContainer(
      context,
      accountName,
      containerName,
      options
    );

    const response: Models.FileSystemDeleteResponse = {
      statusCode: 202,
      requestId: context.contextId,
      // clientRequestId: options.requestId,
      date: context.startTime,
      version: DATA_LAKE_API_VERSION
    };

    return response;
  }

  async listPaths(
    recursive: boolean,
    options: Models.FileSystemListPathsOptionalParams,
    context: Context
  ): Promise<Models.FileSystemListPathsResponse> {
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const directory = options.path || "";

    const containerRes = await this.getProperties(options, context);

    const [paths, marker] = await this.metadataStore.listPaths(
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
      paths,
      continuation: marker ? marker : undefined
    };

    return response;
  }

  /**
   * list blobs flat segments
   *
   * @param {Models.FileSystemListBlobFlatSegmentOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.FileSystemListBlobFlatSegmentResponse>}
   * @memberof ContainerHandler
   */
  public async listBlobFlatSegment(
    options: Models.FileSystemListBlobFlatSegmentOptionalParams,
    context: Context
  ): Promise<Models.FileSystemListBlobFlatSegmentResponse> {
      return await this.containerHandler.listBlobFlatSegment(
      options,
      context
    );
  }

  /**
   * List blobs hierarchy.
   *
   * @param {string} delimiter
   * @param {Models.ContainerListBlobHierarchySegmentOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerListBlobHierarchySegmentResponse>}
   * @memberof ContainerHandler
   */
  async listBlobHierarchySegment(
    delimiter: string,
    options: Models.FileSystemListBlobHierarchySegmentOptionalParams,
    context: Context
  ): Promise<Models.FileSystemListBlobHierarchySegmentResponse> {
    return await this.containerHandler.listBlobHierarchySegment(
      delimiter,
      options,
      context
    );

    // const response: Models.FileSystemListBlobHierarchySegmentResponse = {
    //   ...res,
    //   version: DATA_LAKE_API_VERSION,
    //   segment: {
    //     blobPrefixes: res.segment.blobPrefixes,
    //     blobItems: res.segment.blobItems.map((item) => {
    //       const newBlobItem: Models.BlobItemInternal = {
    //         ...item,
    //         properties: {
    //           ...item.properties,
    //           etag: removeQuotationFromListBlobEtag(item.properties.etag),
    //           accessTierInferred:
    //             item.properties.accessTierInferred === true ? true : undefined
    //         }
    //       };

    //       return newBlobItem;
    //     })
    //   }
    // };
  }
}
