import uuid from "uuid/v4";
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

    // Check Lease status
    if (container.properties.leaseStatus === Models.LeaseStatusType.Locked) {
      if (
        options.leaseAccessConditions === undefined ||
        options.leaseAccessConditions.leaseId === undefined ||
        options.leaseAccessConditions.leaseId === null
      ) {
        const blobCtx = new BlobStorageContext(context);
        throw StorageErrorFactory.getContainerLeaseIdMissing(
          blobCtx.contextID!
        );
      } else if (
        container.leaseId !== undefined &&
        options.leaseAccessConditions.leaseId.toLowerCase() !==
          container.leaseId.toLowerCase()
      ) {
        const blobCtx = new BlobStorageContext(context);
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithContainerOperation(
          blobCtx.contextID!
        );
      }
    }

    // TODO: Mark container as being deleted status, then (mark) delete all blobs async
    // When above finishes, execute following delete container operation
    // Because following delete container operation will only delete DB metadata for container and
    // blobs under the container, but will not clean up blob data in disk
    await this.dataStore.deleteContainer(container.accountName, container.name);
    await this.dataStore.deleteBlobs(container.accountName, container.name);

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

    // check the lease action aligned with current lease state.
    if (container.properties.leaseState === Models.LeaseStateType.Breaking) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseAlreadyPresent(
        blobCtx.contextID!
      );
    }

    // update the lease information
    if (options.duration === -1 || options.duration === undefined) {
      container.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    } else {
      // verify options.duration between 15 and 60
      if (options.duration > 60 || options.duration < 15) {
        await Mutex.unlock(containerName);
        throw StorageErrorFactory.getContainerInvalidLeaseDuration(
          blobCtx.contextID!
        );
      }
      container.properties.leaseDuration = Models.LeaseDurationType.Fixed;
      container.leaseExpireTime = new Date();
      container.leaseExpireTime.setSeconds(
        container.leaseExpireTime.getSeconds() + options.duration
      );
      container.leaseduration = options.duration;
    }
    container.properties.leaseState = Models.LeaseStateType.Leased;
    container.properties.leaseStatus = Models.LeaseStatusType.Locked;
    container.leaseId =
      options.proposedLeaseId != null ? options.proposedLeaseId : uuid();
    container.leaseBreakExpireTime = undefined;

    container.properties.lastModified = blobCtx.startTime!;
    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerAcquireLeaseResponse = {
      date: container.properties.lastModified,
      eTag: newEtag(),
      lastModified: container.properties.lastModified,
      leaseId: container.leaseId,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 201
    };

    return response;
  }

  public async releaseLease(
    leaseId: string,
    options: Models.ContainerReleaseLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerReleaseLeaseResponse> {
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

    // check the lease action aligned with current lease state.
    if (container.properties.leaseState === Models.LeaseStateType.Available) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // Check lease ID
    if (container.leaseId !== leaseId) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // update the lease information
    container.properties.leaseState = Models.LeaseStateType.Available;
    container.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
    container.properties.leaseDuration = undefined;
    container.leaseduration = undefined;
    container.leaseId = undefined;
    container.leaseExpireTime = undefined;
    container.leaseBreakExpireTime = undefined;
    container.leaseduration = undefined;

    container.properties.lastModified = blobCtx.startTime!;
    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerReleaseLeaseResponse = {
      date: container.properties.lastModified,
      eTag: newEtag(),
      lastModified: container.properties.lastModified,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    return response;
  }

  public async renewLease(
    leaseId: string,
    options: Models.ContainerRenewLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerRenewLeaseResponse> {
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

    // check the lease action aligned with current lease state.
    if (container.properties.leaseState === Models.LeaseStateType.Available) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }
    if (
      container.properties.leaseState === Models.LeaseStateType.Breaking ||
      container.properties.leaseState === Models.LeaseStateType.Broken
    ) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseIsBrokenAndCannotBeRenewed(
        blobCtx.contextID!
      );
    }

    // Check lease ID
    if (container.leaseId !== leaseId) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // update the lease information
    container.properties.leaseState = Models.LeaseStateType.Leased;
    container.properties.leaseStatus = Models.LeaseStatusType.Locked;
    // when container.leaseduration has value (not -1), means fixed duration
    if (
      container.leaseduration !== undefined &&
      container.leaseduration !== -1
    ) {
      container.leaseExpireTime = new Date();
      container.leaseExpireTime.setSeconds(
        container.leaseExpireTime.getSeconds() + container.leaseduration
      );
      container.properties.leaseDuration = Models.LeaseDurationType.Fixed;
    } else {
      container.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    }
    container.properties.lastModified = blobCtx.startTime!;
    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerRenewLeaseResponse = {
      date: container.properties.lastModified,
      eTag: newEtag(),
      lastModified: container.properties.lastModified,
      leaseId: container.leaseId,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    return response;
  }

  public async breakLease(
    options: Models.ContainerBreakLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerBreakLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;
    let container: ContainerModel;
    let leaseTime: number;
    leaseTime = 0;

    await Mutex.lock(containerName);
    try {
      container = await this.getSimpleContainerFromStorage(context);
    } catch (error) {
      await Mutex.unlock(containerName);
      throw error;
    }

    // check the lease action aligned with current lease state.
    if (container.properties.leaseState === Models.LeaseStateType.Available) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseNotPresentWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // update the lease information
    if (
      container.properties.leaseState === Models.LeaseStateType.Expired ||
      container.properties.leaseState === Models.LeaseStateType.Broken ||
      options.breakPeriod === 0 ||
      options.breakPeriod === undefined
    ) {
      container.properties.leaseState = Models.LeaseStateType.Broken;
      container.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
      container.properties.leaseDuration = undefined;
      container.leaseduration = undefined;
      container.leaseExpireTime = undefined;
      container.leaseBreakExpireTime = undefined;
      leaseTime = 0;
    } else {
      container.properties.leaseState = Models.LeaseStateType.Breaking;
      container.properties.leaseStatus = Models.LeaseStatusType.Locked;
      container.leaseduration = undefined;
      if (
        container.properties.leaseDuration === Models.LeaseDurationType.Infinite
      ) {
        container.properties.leaseDuration = undefined;
        container.leaseExpireTime = undefined;
        container.leaseBreakExpireTime = new Date();
        container.leaseBreakExpireTime.setSeconds(
          container.leaseBreakExpireTime.getSeconds() + options.breakPeriod
        );
        leaseTime = options.breakPeriod;
      } else {
        let newleaseBreakExpireTime = new Date();
        newleaseBreakExpireTime.setSeconds(
          newleaseBreakExpireTime.getSeconds() + options.breakPeriod
        );
        if (
          container.leaseExpireTime !== undefined &&
          newleaseBreakExpireTime > container.leaseExpireTime
        ) {
          newleaseBreakExpireTime = container.leaseExpireTime;
        }
        if (
          container.leaseBreakExpireTime === undefined ||
          container.leaseBreakExpireTime > newleaseBreakExpireTime
        ) {
          container.leaseBreakExpireTime = newleaseBreakExpireTime;
        }
        leaseTime = Math.round(
          Math.abs(
            container.leaseBreakExpireTime.getTime() - new Date().getTime()
          ) / 1000
        );
        container.leaseExpireTime = undefined;
        container.properties.leaseDuration = undefined;
      }
    }

    container.properties.lastModified = blobCtx.startTime!;
    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerBreakLeaseResponse = {
      date: container.properties.lastModified,
      eTag: newEtag(),
      lastModified: container.properties.lastModified,
      leaseTime,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 202
    };

    return response;
  }

  public async changeLease(
    leaseId: string,
    proposedLeaseId: string,
    options: Models.ContainerChangeLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerChangeLeaseResponse> {
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

    // check the lease action aligned with current lease state.
    if (
      container.properties.leaseState === Models.LeaseStateType.Available ||
      container.properties.leaseState === Models.LeaseStateType.Expired ||
      container.properties.leaseState === Models.LeaseStateType.Broken
    ) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseNotPresentWithLeaseOperation(
        blobCtx.contextID!
      );
    }
    if (container.properties.leaseState === Models.LeaseStateType.Breaking) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseIsBreakingAndCannotBeChanged(
        blobCtx.contextID!
      );
    }

    // Check lease ID
    if (container.leaseId !== leaseId) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // update the lease information, only need update lease ID
    container.leaseId = proposedLeaseId;

    container.properties.lastModified = blobCtx.startTime!;
    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerChangeLeaseResponse = {
      date: container.properties.lastModified,
      eTag: newEtag(),
      lastModified: container.properties.lastModified,
      leaseId: container.leaseId,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    return response;
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

    let container = await this.dataStore.getContainer(
      accountName,
      containerName
    );
    if (!container) {
      throw StorageErrorFactory.getContainerNotFound(blobCtx.contextID!);
    }

    container = this.updateLeaseAttributes(container);

    return container;
  }

  /**
   * Update container lease Attributes according to the current time.
   * The Attribute not set back
   *
   * @private
   * @param {ContainerModel} container
   * @returns {ContainerModel}
   * @memberof ContainerHandler
   */
  private updateLeaseAttributes(container: ContainerModel): ContainerModel {
    // check Leased -> Expired
    if (
      container.properties.leaseState === Models.LeaseStateType.Leased &&
      container.properties.leaseDuration === Models.LeaseDurationType.Fixed
    ) {
      if (
        container.leaseExpireTime !== undefined &&
        new Date() > container.leaseExpireTime
      ) {
        container.properties.leaseState = Models.LeaseStateType.Expired;
        container.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
        container.properties.leaseDuration = undefined;
        container.leaseExpireTime = undefined;
        container.leaseBreakExpireTime = undefined;
      }
    }

    // check Breaking -> Broken
    if (container.properties.leaseState === Models.LeaseStateType.Breaking) {
      if (
        container.leaseBreakExpireTime !== undefined &&
        new Date() > container.leaseBreakExpireTime
      ) {
        container.properties.leaseState = Models.LeaseStateType.Broken;
        container.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
        container.properties.leaseDuration = undefined;
        container.leaseExpireTime = undefined;
        container.leaseBreakExpireTime = undefined;
      }
    }
    return container;
  }
}
