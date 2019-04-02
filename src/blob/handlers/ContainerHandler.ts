import Mutex from "../../common/Mutex";
import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IContainerHandler from "../generated/handlers/IContainerHandler";
import { ContainerModel } from "../persistence/IBlobDataStore";
import { API_VERSION } from "../utils/constants";
import { newEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";

/**
 * ContainerHandler handles Azure Storage Blob container related requests.
 *
 * @export
 * @class ContainerHandler
 * @implements {IHandler}
 */
export default class ContainerHandler extends BaseHandler
  implements IContainerHandler {
  /**
   * Default listing blobs max number.
   *
   * @private
   * @memberof ContainerHandler
   */
  private readonly LIST_BLOBS_MAX_RESULTS_DEFAULT = 5000;

  public async create(
    options: Models.ContainerCreateOptionalParams,
    context: Context
  ): Promise<Models.ContainerCreateResponse> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;
    const lastModified = blobCtx.startTime!;
    const etag = newEtag();

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (container) {
      throw StorageErrorFactory.getContainerAlreadyExists(blobCtx.contextID!);
    }

    await this.dataStore.updateContainer({
      accountName,
      metadata: options.metadata,
      name: containerName,
      properties: {
        etag,
        lastModified,
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        publicAccess: options.access
      }
    });

    const response: Models.ContainerCreateResponse = {
      eTag: etag,
      lastModified,
      requestId: blobCtx.contextID,
      statusCode: 201,
      version: API_VERSION
    };

    return response;
  }

  public async getProperties(
    options: Models.ContainerGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ContainerGetPropertiesResponse> {
    const container = await this.getSimpleContainerFromStorage(context);
    const response: Models.ContainerGetPropertiesResponse = {
      eTag: container.properties.etag,
      ...container.properties,
      blobPublicAccess: container.properties.publicAccess,
      metadata: container.metadata,
      requestId: context.contextID,
      statusCode: 200,
      version: API_VERSION
    };
    return response;
  }

  public async getPropertiesWithHead(
    options: Models.ContainerGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ContainerGetPropertiesResponse> {
    return this.getProperties(options, context);
  }

  public async delete(
    options: Models.ContainerDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.ContainerDeleteResponse> {
    const container = await this.getSimpleContainerFromStorage(context);

    // TODO: Mark container as being deleted status, then (mark) delete all blobs async
    // When above finishes, execute following delete container operation
    // Because following delete container operation will only delete DB metadata for container and
    // blobs under the container, but will not clean up blob data in disk
    await this.dataStore.deleteContainer(container.accountName, container.name);

    const response: Models.ContainerDeleteResponse = {
      date: context.startTime,
      requestId: context.contextID,
      statusCode: 202,
      version: API_VERSION
    };

    return response;
  }

  public async setMetadata(
    options: Models.ContainerSetMetadataOptionalParams,
    context: Context
  ): Promise<Models.ContainerSetMetadataResponse> {
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;
    let container: ContainerModel;

    await Mutex.lock(containerName);
    try {
      container = await this.getSimpleContainerFromStorage(context);
    } catch (error) {
      await Mutex.unlock(containerName);
      throw error;
    }

    container.metadata = options.metadata;
    container.properties.lastModified = blobCtx.startTime!;
    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerSetMetadataResponse = {
      date: container.properties.lastModified,
      eTag: newEtag(),
      lastModified: container.properties.lastModified,
      requestId: context.contextID,
      statusCode: 200
    };

    return response;
  }

  public async getAccessPolicy(
    options: Models.ContainerGetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.ContainerGetAccessPolicyResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async setAccessPolicy(
    options: Models.ContainerSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.ContainerSetAccessPolicyResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async acquireLease(
    options: Models.ContainerAcquireLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerAcquireLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async releaseLease(
    leaseId: string,
    options: Models.ContainerReleaseLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerReleaseLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async renewLease(
    leaseId: string,
    options: Models.ContainerRenewLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerRenewLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async breakLease(
    options: Models.ContainerBreakLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerBreakLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async changeLease(
    leaseId: string,
    proposedLeaseId: string,
    options: Models.ContainerChangeLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerChangeLeaseResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async listBlobFlatSegment(
    options: Models.ContainerListBlobFlatSegmentOptionalParams,
    context: Context
  ): Promise<Models.ContainerListBlobFlatSegmentResponse> {
    throw new NotImplementedError(context.contextID);
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
  public async listBlobHierarchySegment(
    delimiter: string,
    options: Models.ContainerListBlobHierarchySegmentOptionalParams,
    context: Context
  ): Promise<Models.ContainerListBlobHierarchySegmentResponse> {
    const container = await this.getSimpleContainerFromStorage(context);
    const request = context.request!;
    const accountName = container.accountName;
    const containerName = container.name;
    const marker = parseInt(options.marker || "0", 10);
    options.prefix = options.prefix || "";
    options.marker = options.marker || "";

    const [blobs, nextMarker] = await this.dataStore.listBlobs(
      accountName,
      containerName,
      options.prefix,
      options.maxresults,
      marker
    );

    const blobItems: Models.BlobItem[] = [];
    const blobPrefixes: Models.BlobPrefix[] = [];
    const blobPrefixesSet = new Set<string>();

    const prefixLength = options.prefix.length;
    for (const blob of blobs) {
      const delimiterPosAfterPrefix = blob.name.indexOf(
        delimiter,
        prefixLength
      );

      // This is a blob
      if (delimiterPosAfterPrefix < 0) {
        blob.deleted = blob.deleted !== true ? undefined : true;
        blobItems.push(blob);
      } else {
        // This is a prefix
        const prefix = blob.name.substr(0, delimiterPosAfterPrefix + 1);
        blobPrefixesSet.add(prefix);
      }
    }

    const iter = blobPrefixesSet.values();
    let val;
    while (!(val = iter.next()).done) {
      blobPrefixes.push({ name: val.value });
    }

    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const response: Models.ContainerListBlobHierarchySegmentResponse = {
      statusCode: 200,
      contentType: "application/xml",
      requestId: context.contextID,
      version: API_VERSION,
      date: context.startTime,
      serviceEndpoint,
      containerName,
      prefix: options.prefix,
      marker: options.marker,
      maxResults: options.maxresults || this.LIST_BLOBS_MAX_RESULTS_DEFAULT,
      delimiter,
      segment: {
        blobItems,
        blobPrefixes
      },
      nextMarker: `${nextMarker || ""}`
    };

    return response;
  }

  public async getAccountInfo(
    context: Context
  ): Promise<Models.ContainerGetAccountInfoResponse> {
    throw new NotImplementedError(context.contextID);
  }

  /**
   * Get container object from persistency layer according to request context.
   *
   * @private
   * @param {Context} context
   * @returns {Promise<BlobModel>}
   * @memberof ContainerHandler
   */
  private async getSimpleContainerFromStorage(
    context: Context
  ): Promise<ContainerModel> {
    const blobCtx = new BlobStorageContext(context);
    const accountName = blobCtx.account!;
    const containerName = blobCtx.container!;

    const container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    return container;
  }
}
