import BaseHandler from "./BaseHandler";
import IFileSystemOperationsHandler from "../generated/handlers/IFileSystemOperationsHandler";
import * as Models from "../generated/artifacts/models";
import {
  DATA_LAKE_API_VERSION,
  DEFAULT_LIST_BLOBS_MAX_RESULTS
} from "../utils/constants";
import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import { OAuthLevel } from "../../common/models";
import IExtentStore from "../../common/persistence/IExtentStore";
import IDataLakeMetaDataStore from "../persistence/IDataLakeMetadataStore";
import { convertRawHeadersToMetadata, newEtag } from "../../common/utils/utils";
import { removeQuotationFromListBlobEtag } from "../utils/utils";
import { ContainerModel } from "../persistence/IDataLakeMetadataStore";
import Context from "../generated/Context";
import DataLakeContext from "../context/DataLakeContext";
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
    accountDataStore: IAccountDataStore,
    oauth: OAuthLevel | undefined,
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
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const lastModified = blobCtx.startTime!;
    const eTag = newEtag();

    // Preserve metadata key case
    const metadata = convertRawHeadersToMetadata(
      blobCtx.request!.getRawHeaders()
    );

    const ContainerModel: ContainerModel = {
      accountName,
      name: containerName,
      metadata,
      properties: {
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        lastModified,
        etag: eTag
      }
    };

    await this.metadataStore.createContainer(context, ContainerModel);

    const response: Models.FileSystemCreateResponse = {
      statusCode: 201,
      clientRequestId: options.requestId,
      eTag,
      lastModified,
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
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const request = context.request!;
    const marker = options.marker;
    options.marker = options.marker || "";
    let includeSnapshots: boolean = false;
    let includeUncommittedBlobs: boolean = false;
    if (options.include !== undefined) {
      options.include.forEach((element) => {
        if (
          Models.ListBlobsIncludeItem.Snapshots.toLowerCase() ===
          element.toLowerCase()
        ) {
          includeSnapshots = true;
        }
        if (
          Models.ListBlobsIncludeItem.Uncommittedblobs.toLowerCase() ===
          element.toLowerCase()
        ) {
          includeUncommittedBlobs = true;
        }
      });
    }

    let maxResults = options.maxresults || options.maxresults;
    if (
      maxResults === undefined ||
      maxResults > DEFAULT_LIST_BLOBS_MAX_RESULTS
    ) {
      maxResults = DEFAULT_LIST_BLOBS_MAX_RESULTS;
    }

    const [blobs, _prefixes, nextMarker] = await this.metadataStore.listBlobs(
      context,
      accountName,
      containerName,
      undefined,
      undefined,
      options.prefix,
      maxResults,
      marker,
      includeSnapshots,
      includeUncommittedBlobs
    );

    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const response: Models.FileSystemListBlobFlatSegmentResponse = {
      statusCode: 200,
      contentType: "application/xml",
      requestId: context.contextId,
      version: DATA_LAKE_API_VERSION,
      date: context.startTime,
      serviceEndpoint,
      containerName,
      prefix: options.prefix || "",
      marker: options.marker,
      maxResults,
      segment: {
        blobItems: blobs.map((item) => {
          return {
            ...item,
            deleted: item.deleted !== true ? undefined : true,
            snapshot: item.snapshot || undefined,
            properties: {
              ...item.properties,
              etag: removeQuotationFromListBlobEtag(item.properties.etag),
              accessTierInferred:
                item.properties.accessTierInferred === true ? true : undefined
            }
          };
        })
      },
      clientRequestId: options.requestId,
      nextMarker: `${nextMarker || ""}`
    };

    return response;
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
    // TODO: Need update list out blobs lease properties with BlobHandler.updateLeaseAttributes()
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    await this.metadataStore.checkContainerExist(
      context,
      accountName,
      containerName
    );

    const request = context.request!;
    const marker = options.marker;
    options.prefix = options.prefix || "";
    options.marker = options.marker || "";
    let includeSnapshots: boolean = false;
    let includeUncommittedBlobs: boolean = false;
    if (options.include !== undefined) {
      options.include.forEach((element) => {
        if (
          Models.ListBlobsIncludeItem.Snapshots.toLowerCase() ===
          element.toLowerCase()
        ) {
          includeSnapshots = true;
        }
        if (
          Models.ListBlobsIncludeItem.Uncommittedblobs.toLowerCase() ===
          element.toLowerCase()
        ) {
          includeUncommittedBlobs = true;
        }
      });
    }

    let maxResults = options.maxResults || options.maxresults;
    if (
      maxResults === undefined ||
      maxResults > DEFAULT_LIST_BLOBS_MAX_RESULTS
    ) {
      maxResults = DEFAULT_LIST_BLOBS_MAX_RESULTS;
    }

    const [blobItems, blobPrefixes, nextMarker] = await this.metadataStore.list(
      false, //check
      context,
      accountName,
      containerName,
      delimiter === "" ? undefined : delimiter,
      undefined,
      options.prefix,
      maxResults,
      marker,
      includeSnapshots,
      includeUncommittedBlobs
    );

    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const response: Models.FileSystemListBlobHierarchySegmentResponse = {
      statusCode: 200,
      contentType: "application/xml",
      requestId: context.contextId,
      version: DATA_LAKE_API_VERSION,
      date: context.startTime,
      serviceEndpoint,
      containerName,
      prefix: options.prefix,
      marker: options.marker,
      maxResults,
      delimiter,
      segment: {
        blobPrefixes,
        blobItems: blobItems.map((item) => {
          const newBlobItem: Models.BlobItemInternal = {
            ...item,
            properties: {
              ...item.properties,
              etag: removeQuotationFromListBlobEtag(item.properties.etag),
              accessTierInferred:
                item.properties.accessTierInferred === true ? true : undefined
            }
          };

          return newBlobItem;
        })
      },
      clientRequestId: options.requestId,
      nextMarker: `${nextMarker || ""}`
    };

    return response;
  }
}
