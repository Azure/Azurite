import BlobStorageContext from "../context/BlobStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IContainerHandler from "../generated/handlers/IContainerHandler";
import { API_VERSION } from "../utils/constants";
import Mutex from "../utils/Mutex";
import { newEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";

/**
 * Manually implement handlers by implementing IContainerHandler interface.
 * Handlers will take to persistency layer directly.
 *
 * @export
 * @class SimpleContainerHandler
 * @implements {IHandler}
 */
export default class ContainerHandler extends BaseHandler
  implements IContainerHandler {
  public async create(
    options: Models.ContainerCreateOptionalParams,
    context: Context
  ): Promise<Models.ContainerCreateResponse> {
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;

    const etag = `"${new Date().getTime()}"`; // TODO: Implement etag
    const lastModified = new Date();

    const container = await this.dataStore.getContainer(containerName);
    if (container) {
      throw StorageErrorFactory.getContainerAlreadyExists(blobCtx.contextID!);
    }

    await this.dataStore.updateContainer({
      metadata: options.metadata,
      name: containerName,
      properties: {
        etag,
        lastModified
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
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;

    const container = await this.dataStore.getContainer(containerName);
    if (!container) {
      throw StorageErrorFactory.getContainerNotFoundError(blobCtx.contextID!);
    }

    const response: Models.ContainerGetPropertiesResponse = {
      eTag: container.properties.etag,
      ...container.properties,
      metadata: container.metadata,
      requestId: blobCtx.contextID,
      statusCode: 200
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
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;

    const container = await this.dataStore.getContainer(containerName);
    if (container === undefined) {
      throw StorageErrorFactory.getContainerNotFoundError(blobCtx.contextID!);
    }

    // TODO: Mark container as being deleted status, then (mark) delete all blobs async
    // When above finishes, execute following delete container operation
    // Because following delete container operation will only delete DB metadata for container and
    // blobs under the container, but will not clean up blob data in disk
    await this.dataStore.deleteContainer(containerName);

    const response: Models.ContainerDeleteResponse = {
      date: new Date(),
      requestId: blobCtx.contextID,
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

    await Mutex.lock(containerName);

    const container = await this.dataStore.getContainer<Models.ContainerItem>(
      containerName
    );
    if (!container) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerNotFoundError(blobCtx.contextID!);
    }

    container.metadata = options.metadata;
    container.properties.lastModified = new Date();

    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerSetMetadataResponse = {
      date: container.properties.lastModified,
      eTag: newEtag(),
      lastModified: container.properties.lastModified,
      requestId: blobCtx.contextID,
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

  public async listBlobHierarchySegment(
    delimiter: string,
    options: Models.ContainerListBlobHierarchySegmentOptionalParams,
    context: Context
  ): Promise<Models.ContainerListBlobHierarchySegmentResponse> {
    throw new NotImplementedError(context.contextID);
  }

  public async getAccountInfo(
    context: Context
  ): Promise<Models.ContainerGetAccountInfoResponse> {
    throw new NotImplementedError(context.contextID);
  }
}
