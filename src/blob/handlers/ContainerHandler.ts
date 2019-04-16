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

  /**
   * create container
   *
   * @param {Models.ContainerCreateOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerCreateResponse>}
   * @memberof ContainerHandler
   */
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

  /**
   * get container properties
   *
   * @param {Models.ContainerGetPropertiesOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetPropertiesResponse>}
   * @memberof ContainerHandler
   */
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

  /**
   * get container properties with headers
   *
   * @param {Models.ContainerGetPropertiesOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetPropertiesResponse>}
   * @memberof ContainerHandler
   */
  public async getPropertiesWithHead(
    options: Models.ContainerGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.ContainerGetPropertiesResponse> {
    return this.getProperties(options, context);
  }

  /**
   * delete container
   *
   * @param {Models.ContainerDeleteMethodOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerDeleteResponse>}
   * @memberof ContainerHandler
   */
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
    } else if (
      options.leaseAccessConditions !== undefined &&
      options.leaseAccessConditions.leaseId !== undefined &&
      options.leaseAccessConditions.leaseId !== null &&
      options.leaseAccessConditions.leaseId !== ""
    ) {
      const blobCtx = new BlobStorageContext(context);
      throw StorageErrorFactory.getBlobLeaseLost(blobCtx.contextID!);
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

  /**
   * set container metadata
   *
   * @param {Models.ContainerSetMetadataOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerSetMetadataResponse>}
   * @memberof ContainerHandler
   */
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

  /**
   * get container access policy
   *
   * @param {Models.ContainerGetAccessPolicyOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetAccessPolicyResponse>}
   * @memberof ContainerHandler
   */
  public async getAccessPolicy(
    options: Models.ContainerGetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.ContainerGetAccessPolicyResponse> {
    throw new NotImplementedError(context.contextID);
  }

  /**
   * set container access policy
   *
   * @param {Models.ContainerSetAccessPolicyOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerSetAccessPolicyResponse>}
   * @memberof ContainerHandler
   */
  public async setAccessPolicy(
    options: Models.ContainerSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.ContainerSetAccessPolicyResponse> {
    throw new NotImplementedError(context.contextID);
  }

  /**
   * acquire container lease
   *
   * @param {Models.ContainerAcquireLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerAcquireLeaseResponse>}
   * @memberof ContainerHandler
   */
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
      throw StorageErrorFactory.getLeaseAlreadyPresent(blobCtx.contextID!);
    }
    if (
      container.properties.leaseState === Models.LeaseStateType.Leased &&
      options.proposedLeaseId !== container.leaseId
    ) {
      throw StorageErrorFactory.getLeaseAlreadyPresent(context.contextID!);
    }

    // update the lease information
    if (options.duration === -1 || options.duration === undefined) {
      container.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    } else {
      // verify options.duration between 15 and 60
      if (options.duration > 60 || options.duration < 15) {
        await Mutex.unlock(containerName);
        throw StorageErrorFactory.getInvalidLeaseDuration(blobCtx.contextID!);
      }
      container.properties.leaseDuration = Models.LeaseDurationType.Fixed;
      container.leaseExpireTime = blobCtx.startTime!;
      container.leaseExpireTime.setSeconds(
        container.leaseExpireTime.getSeconds() + options.duration
      );
      container.leaseduration = options.duration;
    }
    container.properties.leaseState = Models.LeaseStateType.Leased;
    container.properties.leaseStatus = Models.LeaseStatusType.Locked;
    container.leaseId =
      options.proposedLeaseId !== "" && options.proposedLeaseId !== undefined
        ? options.proposedLeaseId
        : uuid();
    container.leaseBreakExpireTime = undefined;

    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerAcquireLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: container.properties.etag,
      lastModified: container.properties.lastModified,
      leaseId: container.leaseId,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 201
    };

    return response;
  }

  /**
   * release container lease
   *
   * @param {string} leaseId
   * @param {Models.ContainerReleaseLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerReleaseLeaseResponse>}
   * @memberof ContainerHandler
   */
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

    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerReleaseLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: container.properties.etag,
      lastModified: container.properties.lastModified,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    return response;
  }

  /**
   * renew container lease
   *
   * @param {string} leaseId
   * @param {Models.ContainerRenewLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerRenewLeaseResponse>}
   * @memberof ContainerHandler
   */
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
      throw StorageErrorFactory.getLeaseIsBrokenAndCannotBeRenewed(
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
      container.leaseExpireTime = blobCtx.startTime!;
      container.leaseExpireTime.setSeconds(
        container.leaseExpireTime.getSeconds() + container.leaseduration
      );
      container.properties.leaseDuration = Models.LeaseDurationType.Fixed;
    } else {
      container.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    }
    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerRenewLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: container.properties.etag,
      lastModified: container.properties.lastModified,
      leaseId: container.leaseId,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    return response;
  }

  /**
   * break container lease
   *
   * @param {Models.ContainerBreakLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerBreakLeaseResponse>}
   * @memberof ContainerHandler
   */
  public async breakLease(
    options: Models.ContainerBreakLeaseOptionalParams,
    context: Context
  ): Promise<Models.ContainerBreakLeaseResponse> {
    const blobCtx = new BlobStorageContext(context);
    const containerName = blobCtx.container!;
    let container: ContainerModel;
    let leaseTimeinSecond: number;
    leaseTimeinSecond = 0;

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
    // verify options.breakPeriod between 0 and 60
    if (
      options.breakPeriod !== undefined &&
      (options.breakPeriod > 60 || options.breakPeriod < 0)
    ) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getInvalidLeaseBreakPeriod(blobCtx.contextID!);
    }
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
      leaseTimeinSecond = 0;
    } else {
      container.properties.leaseState = Models.LeaseStateType.Breaking;
      container.properties.leaseStatus = Models.LeaseStatusType.Locked;
      container.leaseduration = undefined;
      if (
        container.properties.leaseDuration === Models.LeaseDurationType.Infinite
      ) {
        container.properties.leaseDuration = undefined;
        container.leaseExpireTime = undefined;
        container.leaseBreakExpireTime = new Date(blobCtx.startTime!);
        container.leaseBreakExpireTime.setSeconds(
          container.leaseBreakExpireTime.getSeconds() + options.breakPeriod
        );
        leaseTimeinSecond = options.breakPeriod;
      } else {
        let newleaseBreakExpireTime = new Date(blobCtx.startTime!);
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
        leaseTimeinSecond = Math.round(
          Math.abs(
            container.leaseBreakExpireTime.getTime() -
              blobCtx.startTime!.getTime()
          ) / 1000
        );
        container.leaseExpireTime = undefined;
        container.properties.leaseDuration = undefined;
      }
    }

    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerBreakLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: container.properties.etag,
      lastModified: container.properties.lastModified,
      leaseTime: leaseTimeinSecond,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 202
    };

    return response;
  }

  /**
   * change container lease
   *
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Models.ContainerChangeLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerChangeLeaseResponse>}
   * @memberof ContainerHandler
   */
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
      throw StorageErrorFactory.getLeaseIsBreakingAndCannotBeChanged(
        blobCtx.contextID!
      );
    }

    // Check lease ID
    if (
      container.leaseId !== leaseId &&
      container.leaseId !== proposedLeaseId
    ) {
      await Mutex.unlock(containerName);
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        blobCtx.contextID!
      );
    }

    // update the lease information, only need update lease ID
    container.leaseId = proposedLeaseId;

    await this.dataStore.updateContainer(container);
    await Mutex.unlock(containerName);

    const response: Models.ContainerChangeLeaseResponse = {
      date: blobCtx.startTime!,
      eTag: container.properties.etag,
      lastModified: container.properties.lastModified,
      leaseId: container.leaseId,
      requestId: context.contextID,
      version: API_VERSION,
      statusCode: 200
    };

    return response;
  }

  /**
   * list blobs flat segments
   *
   * @param {Models.ContainerListBlobFlatSegmentOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ContainerListBlobFlatSegmentResponse>}
   * @memberof ContainerHandler
   */
  public async listBlobFlatSegment(
    options: Models.ContainerListBlobFlatSegmentOptionalParams,
    context: Context
  ): Promise<Models.ContainerListBlobFlatSegmentResponse> {
    const container = await this.getSimpleContainerFromStorage(context);
    const request = context.request!;
    const accountName = container.accountName;
    const containerName = container.name;
    const marker = parseInt(options.marker || "0", 10);
    const delimiter = "";
    options.prefix = ""; // we do not support a prefix for the flat list
    options.marker = options.marker || "";

    const [blobs, nextMarker] = await this.dataStore.listBlobs(
      accountName,
      containerName,
      options.prefix,
      options.maxresults,
      marker
    );

    const blobItems: Models.BlobItem[] = [];

    for (const blob of blobs) {
      blob.deleted = blob.deleted !== true ? undefined : true;
      blobItems.push(blob);
    }

    // only need an empty array for the prefixes
    const blobPrefixes: Models.BlobPrefix[] = [];

    const serviceEndpoint = `${request.getEndpoint()}/${accountName}`;
    const response: Models.ContainerListBlobFlatSegmentResponse = {
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
    // TODO: Need update list out blobs lease properties with BlobHandler.updateLeaseAttributes()
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

  /**
   * get account info
   *
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetAccountInfoResponse>}
   * @memberof ContainerHandler
   */
  public async getAccountInfo(
    context: Context
  ): Promise<Models.ContainerGetAccountInfoResponse> {
    throw new NotImplementedError(context.contextID);
  }

  /**
   * get account info with headers
   *
   * @param {Context} context
   * @returns {Promise<Models.ContainerGetAccountInfoResponse>}
   * @memberof ContainerHandler
   */
  public async getAccountInfoWithHead(
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

    container = this.updateLeaseAttributes(container, blobCtx.startTime!);

    return container;
  }

  /**
   * Update container lease Attributes according to the current time.
   * The Attribute not set back
   *
   * @private
   * @param {ContainerModel} container
   * @param {Date} currentTime
   * @returns {ContainerModel}
   * @memberof ContainerHandler
   */
  private updateLeaseAttributes(
    container: ContainerModel,
    currentTime: Date
  ): ContainerModel {
    // check Leased -> Expired
    if (
      container.properties.leaseState === Models.LeaseStateType.Leased &&
      container.properties.leaseDuration === Models.LeaseDurationType.Fixed
    ) {
      if (
        container.leaseExpireTime !== undefined &&
        currentTime > container.leaseExpireTime
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
        currentTime > container.leaseBreakExpireTime
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
