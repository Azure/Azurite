import { BlobTags } from "@azure/storage-blob";
import ICleaner from "../../common/ICleaner";
import IDataStore from "../../common/IDataStore";
import IGCExtentProvider from "../../common/IGCExtentProvider";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { FilterBlobItem } from "../generated/artifacts/models";

/**
 * This model describes a chunk inside a persistency extent for a given extent ID.
 * A chunk points to a sub-range of an extent.
 *
 * @export
 * @interface IPersistencyChunk
 */
export interface IExtentChunk {
  id: string; // The persistency layer storage extent ID where the chunk belongs to
  offset: number; // Chunk offset inside the extent where chunk starts in bytes
  count: number; // Chunk length in bytes
}

export const ZERO_EXTENT_ID = "*ZERO*";

/** MODELS FOR SERVICE */
interface IServiceAdditionalProperties {
  accountName: string;
}

export type ServicePropertiesModel = Models.StorageServiceProperties &
  IServiceAdditionalProperties;

/** MODELS FOR CONTAINER */
interface IContainerAdditionalProperties {
  accountName: string;
  leaseDurationSeconds?: number;
  leaseId?: string;
  leaseExpireTime?: Date;
  leaseBreakTime?: Date;
  containerAcl?: Models.SignedIdentifier[];
}

export type ContainerModel = Models.ContainerItem &
  IContainerAdditionalProperties;

export interface IContainerMetadata {
  [propertyName: string]: string;
}

// The response model for getContainerProperties.
export type GetContainerPropertiesResponse = Models.ContainerItem;

// The response for getContainerAccessPolicy.
interface IGetContainerAccessPolicyResponse {
  properties: Models.ContainerProperties;
  containerAcl?: Models.SignedIdentifier[];
}
export type GetContainerAccessPolicyResponse = IGetContainerAccessPolicyResponse;

// The params for setContainerAccessPolicy.
interface ISetContainerAccessPolicyOptions {
  lastModified: Date;
  etag: string;
  containerAcl?: Models.SignedIdentifier[];
  publicAccess?: Models.PublicAccessType;
  leaseAccessConditions?: Models.LeaseAccessConditions;
  modifiedAccessConditions?: Models.ModifiedAccessConditions;
}
export type SetContainerAccessPolicyOptions = ISetContainerAccessPolicyOptions;

// The response model for each lease-related request.
interface IContainerLeaseResponse {
  properties: Models.ContainerProperties;
  leaseId?: string;
  leaseTime?: number;
}
export type AcquireContainerLeaseResponse = IContainerLeaseResponse;
export type ReleaseContainerLeaseResponse = Models.ContainerProperties;
export type RenewContainerLeaseResponse = IContainerLeaseResponse;
export type BreakContainerLeaseResponse = IContainerLeaseResponse;
export type ChangeContainerLeaseResponse = IContainerLeaseResponse;

/** MODELS FOR BLOBS */
interface IPersistencyPropertiesRequired {
  /**
   * A reference to persistency layer chunk of data.
   *
   * @type {IExtentChunk}
   * @memberof IPersistencyProperties
   */
  persistency: IExtentChunk;
}

interface IPersistencyPropertiesOptional {
  /**
   * A reference to persistency layer chunk of data.
   *
   * @type {IExtentChunk}
   * @memberof IPersistencyProperties
   */
  persistency?: IExtentChunk;
}

interface IBlockBlobAdditionalProperties {
  /**
   * False for uncommitted block blob, otherwise true.
   *
   * @type {boolean}
   * @memberof IBlobAdditionalProperties
   */
  isCommitted: boolean;

  /**
   * Committed blocks for block blob.
   *
   * @type {PersistencyBlockModel[]}
   * @memberof IBlobAdditionalProperties
   */
  committedBlocksInOrder?: PersistencyBlockModel[];
}

/**
 * PageRange model with pointers to persistency chunk.
 */
export type PersistencyPageRange = IPersistencyPropertiesRequired &
  Models.PageRange;

interface IPageBlobAdditionalProperties {
  pageRangesInOrder?: PersistencyPageRange[];
}

interface IBlobAdditionalProperties {
  accountName: string;
  containerName: string;
  leaseDurationSeconds?: number;
  leaseId?: string;
  leaseExpireTime?: Date;
  leaseBreakTime?: Date;
}

export type BlobModel = IBlobAdditionalProperties &
  IPageBlobAdditionalProperties &
  IBlockBlobAdditionalProperties &
  Models.BlobItemInternal &
  IPersistencyPropertiesOptional;

export type BlobPrefixModel = IPersistencyPropertiesOptional &
  Models.BlobPrefix;

// The response model for getContainerProperties.
interface IGetBlobPropertiesRes {
  properties: Models.BlobPropertiesInternal;
  metadata?: Models.BlobMetadata;
  blobCommittedBlockCount?: number; // AppendBlobOnly
}
export type GetBlobPropertiesRes = IGetBlobPropertiesRes;

export type FilterBlobModel = FilterBlobItem;

// The response model for each lease-related request.
interface IBlobLeaseResponse {
  properties: Models.BlobPropertiesInternal;
  leaseId?: string;
  leaseTime?: number;
}
export type AcquireBlobLeaseResponse = IBlobLeaseResponse;
export type ReleaseBlobLeaseResponse = Models.ContainerProperties;
export type RenewBlobLeaseResponse = IBlobLeaseResponse;
export type BreakBlobLeaseResponse = IBlobLeaseResponse;
export type ChangeBlobLeaseResponse = IBlobLeaseResponse;

// The response model for create snapshot.
interface ICreateSnapshotResponse {
  properties: Models.BlobPropertiesInternal;
  snapshot: string;
}
export type CreateSnapshotResponse = ICreateSnapshotResponse;

// The model contain account name, container name, blob name and snapshot for blob.
interface IBlobId {
  account: string;
  container: string;
  blob: string;
  snapshot?: string;
}
export type BlobId = IBlobId;

// The model contain required attributes of pageblob for request getPageRanges.
interface IGetPageRangeResponse {
  pageRangesInOrder?: PersistencyPageRange[];
  properties: Models.BlobPropertiesInternal;
}
export type GetPageRangeResponse = IGetPageRangeResponse;

/** MODELS FOR BLOCKS */
interface IBlockAdditionalProperties {
  accountName: string;
  containerName: string;
  blobName: string;
  isCommitted: boolean;
}

export type PersistencyBlockModel = Models.Block &
  IPersistencyPropertiesRequired;

export type BlockModel = IBlockAdditionalProperties & PersistencyBlockModel;

/**
 * Persistency layer metadata storage interface.
 *
 * TODO: Integrate cache layer to cache account, container & blob metadata.
 *
 * @export
 * @interface IBlobMetadataStore
 * @extends {IDataStore}
 */
export interface IBlobMetadataStore
  extends IGCExtentProvider,
  IDataStore,
  ICleaner {
  /**
   * Update blob service properties. Create service properties if not exists in persistency layer.
   *
   * TODO: Account's service property should be created when storage account is created or metadata
   * storage initialization. This method should only be responsible for updating existing record.
   * In this way, we can reduce one I/O call to get account properties.
   *
   * @param {ServicePropertiesModel} serviceProperties
   * @returns {Promise<ServicePropertiesModel>} undefined properties will be ignored during properties setup
   * @memberof IBlobMetadataStore
   */
  setServiceProperties(
    context: Context,
    serviceProperties: ServicePropertiesModel
  ): Promise<ServicePropertiesModel>;

  /**
   * Get service properties for specific storage account.
   *
   * @param {string} account
   * @returns {Promise<ServicePropertiesModel | undefined>}
   * @memberof IBlobMetadataStore
   */
  getServiceProperties(
    context: Context,
    account: string
  ): Promise<ServicePropertiesModel | undefined>;

  /**
   * List containers with query conditions specified.
   *
   * @param {string} account
   * @param {string} [prefix]
   * @param {number} [maxResults]
   * @param {number} [marker]
   * @returns {(Promise<[ContainerModel[], number | undefined]>)} A tuple including containers and next marker
   * @memberof IBlobMetadataStore
   */
  listContainers(
    context: Context,
    account: string,
    prefix?: string,
    maxResults?: number,
    marker?: string
  ): Promise<[ContainerModel[], string | undefined]>;

  /**
   * Create a container.
   *
   * @param {ContainerModel} container
   * @param {Context} [context]
   * @returns {Promise<ContainerModel>}
   * @memberof IBlobMetadataStore
   */
  createContainer(
    context: Context,
    container: ContainerModel
  ): Promise<ContainerModel>;

  /**
   * Get container properties.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} context
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @returns {Promise<GetContainerPropertiesResponse>}
   * @memberof IBlobMetadataStore
   */
  getContainerProperties(
    context: Context,
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<GetContainerPropertiesResponse>;

  /**
   * Delete container item if exists from persistency layer.
   * Note that this method will mark the specific container with "deleting" tag. Container item
   * will be removed only if all blobs under that container has been removed with GC. During
   * "deleting" status, container and blobs under that container cannot be accessed.
   *
   * TODO: Make sure all metadata interface implementation follow up above assumption.
   * TODO: GC for async container deletion.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} context
   * @param {Models.ContainerDeleteMethodOptionalParams} [options]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  deleteContainer(
    context: Context,
    account: string,
    container: string,
    options?: Models.ContainerDeleteMethodOptionalParams
  ): Promise<void>;

  /**
   * Set container metadata.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {Date} lastModified
   * @param {string} etag
   * @param {IContainerMetadata} [metadata]
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  setContainerMetadata(
    context: Context,
    account: string,
    container: string,
    lastModified: Date,
    etag: string,
    metadata?: IContainerMetadata,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<void>;

  /**
   * Get container access policy.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} context
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @returns {Promise<GetContainerAccessPolicyResponse>}
   * @memberof IBlobMetadataStore
   */
  getContainerACL(
    context: Context,
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<GetContainerAccessPolicyResponse>;

  /**
   * Set container access policy.
   *
   * @param {string} account
   * @param {string} container
   * @param {SetContainerAccessPolicyOptions} setAclModel
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  setContainerACL(
    context: Context,
    account: string,
    container: string,
    setAclModel: SetContainerAccessPolicyOptions
  ): Promise<void>;

  /**
   * Acquire container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {Models.ContainerAcquireLeaseOptionalParams} [options]
   * @param {Context} context
   * @returns {Promise<AcquireContainerLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  acquireContainerLease(
    context: Context,
    account: string,
    container: string,
    options?: Models.ContainerAcquireLeaseOptionalParams
  ): Promise<AcquireContainerLeaseResponse>;

  /**
   * Release container lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {Models.ContainerReleaseLeaseOptionalParams} [options]
   * @returns {Promise<ReleaseContainerLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  releaseContainerLease(
    context: Context,
    account: string,
    container: string,
    leaseId: string,
    options?: Models.ContainerReleaseLeaseOptionalParams
  ): Promise<ReleaseContainerLeaseResponse>;

  /**
   * Renew container lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {Models.ContainerRenewLeaseOptionalParams} [options]
   * @returns {Promise<RenewContainerLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  renewContainerLease(
    context: Context,
    account: string,
    container: string,
    leaseId: string,
    options?: Models.ContainerRenewLeaseOptionalParams
  ): Promise<RenewContainerLeaseResponse>;

  /**
   * Break container lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {(number | undefined)} breakPeriod
   * @param {Models.ContainerBreakLeaseOptionalParams} [options]
   * @returns {Promise<BreakContainerLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  breakContainerLease(
    context: Context,
    account: string,
    container: string,
    breakPeriod: number | undefined,
    options?: Models.ContainerBreakLeaseOptionalParams
  ): Promise<BreakContainerLeaseResponse>;

  /**
   * Change container lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Models.ContainerChangeLeaseOptionalParams} [options]
   * @returns {Promise<ChangeContainerLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  changeContainerLease(
    context: Context,
    account: string,
    container: string,
    leaseId: string,
    proposedLeaseId: string,
    options?: Models.ContainerChangeLeaseOptionalParams
  ): Promise<ChangeContainerLeaseResponse>;

  /**
   * Check the existence of a container.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  checkContainerExist(
    context: Context,
    account: string,
    container: string
  ): Promise<void>;

  listBlobs(
    context: Context,
    account: string,
    container: string,
    delimiter?: string,
    blob?: string,
    prefix?: string,
    maxResults?: number,
    marker?: string,
    includeSnapshots?: boolean,
    includeUncommittedBlobs?: boolean
  ): Promise<[BlobModel[], BlobPrefixModel[], string | undefined]>;

  listAllBlobs(
    maxResults?: number,
    marker?: string,
    includeSnapshots?: boolean,
    includeUncommittedBlobs?: boolean
  ): Promise<[BlobModel[], string | undefined]>;

  filterBlobs(
    context: Context,
    account: string,
    container?: string,
    where?: string,
    maxResults?: number,
    marker?: string,
  ): Promise<[FilterBlobModel[], string | undefined]>;

  /**
   * Create blob item in persistency layer. Will replace if blob exists.
   *
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions] Optional. Will validate lease if provided
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  createBlob(
    context: Context,
    blob: BlobModel,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<void>;

  /**
   * Create snapshot.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions] Optional. Will validate lease if provided
   * @param {Models.BlobMetadata} [metadata]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<CreateSnapshotResponse>}
   * @memberof IBlobMetadataStore
   */
  createSnapshot(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    metadata?: Models.BlobMetadata,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<CreateSnapshotResponse>;

  /**
   * Gets a blob item from metadata store by account name, container name and blob name.
   * Will return block list or page list as well for downloading.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions] Optional. Will validate lease if provided
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<BlobModel>}
   * @memberof IBlobMetadataStore
   */
  downloadBlob(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<BlobModel>;

  /**
   * Get blob properties.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<GetBlobPropertiesRes>}
   * @memberof IBlobMetadataStore
   */
  getBlobProperties(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<GetBlobPropertiesRes>;

  /**
   * Delete blob or its snapshots.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.BlobDeleteMethodOptionalParams} options
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  deleteBlob(
    context: Context,
    account: string,
    container: string,
    blob: string,
    options: Models.BlobDeleteMethodOptionalParams
  ): Promise<void>;

  /**
   * Set blob HTTP headers.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {(Models.BlobHTTPHeaders | undefined)} blobHTTPHeaders
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  setBlobHTTPHeaders(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    blobHTTPHeaders: Models.BlobHTTPHeaders | undefined,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<Models.BlobPropertiesInternal>;

  /**
   * Set blob metadata.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  setBlobMetadata(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    metadata: Models.BlobMetadata | undefined,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<Models.BlobPropertiesInternal>;

  /**
   * Acquire blob lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {number} duration
   * @param {string} [proposedLeaseId]
   * @param {Models.BlobAcquireLeaseOptionalParams} [options]
   * @returns {Promise<AcquireBlobLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  acquireBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    duration: number,
    proposedLeaseId?: string,
    options?: Models.BlobAcquireLeaseOptionalParams
  ): Promise<AcquireBlobLeaseResponse>;

  /**
   * Release blob.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @param {Models.BlobReleaseLeaseOptionalParams} [options]
   * @returns {Promise<ReleaseBlobLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  releaseBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    options?: Models.BlobReleaseLeaseOptionalParams
  ): Promise<ReleaseBlobLeaseResponse>;

  /**
   * Renew blob lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @param {Models.BlobRenewLeaseOptionalParams} [options]
   * @returns {Promise<RenewBlobLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  renewBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    options?: Models.BlobRenewLeaseOptionalParams
  ): Promise<RenewBlobLeaseResponse>;

  /**
   * Change blob lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Models.BlobChangeLeaseOptionalParams} [option]
   * @returns {Promise<ChangeBlobLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  changeBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    proposedLeaseId: string,
    option?: Models.BlobChangeLeaseOptionalParams
  ): Promise<ChangeBlobLeaseResponse>;

  /**
   * Break blob lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {number} [breakPeriod]
   * @param {Models.BlobBreakLeaseOptionalParams} [option]
   * @returns {Promise<BreakBlobLeaseResponse>}
   * @memberof IBlobMetadataStore
   */
  breakBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    breakPeriod?: number,
    option?: Models.BlobBreakLeaseOptionalParams
  ): Promise<BreakBlobLeaseResponse>;

  /**
   * Check the existence of a blob.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  checkBlobExist(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot?: string
  ): Promise<void>;

  /**
   * Get blobType and committed status for SAS authentication.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @returns {(Promise<
   *     { blobType: Models.BlobType | undefined; isCommitted: boolean } | undefined
   *   >)}
   * @memberof IBlobMetadataStore
   */
  getBlobType(
    account: string,
    container: string,
    blob: string,
    snapshot?: string
  ): Promise<
    { blobType: Models.BlobType | undefined; isCommitted: boolean } | undefined
  >;

  /**
   * Start copy from Url.
   *
   * @param {Context} context
   * @param {BlobId} source
   * @param {BlobId} destination
   * @param {string} copySource
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {(Models.AccessTier | undefined)} tier
   * @param {Models.BlobStartCopyFromURLOptionalParams} [leaseAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  startCopyFromURL(
    context: Context,
    source: BlobId,
    destination: BlobId,
    copySource: string,
    metadata: Models.BlobMetadata | undefined,
    tier: Models.AccessTier | undefined,
    leaseAccessConditions?: Models.BlobStartCopyFromURLOptionalParams
  ): Promise<Models.BlobPropertiesInternal>;

  /**
   * Sync copy from Url.
   *
   * @param {Context} context
   * @param {BlobId} source
   * @param {BlobId} destination
   * @param {string} copySource
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {(Models.AccessTier | undefined)} tier
   * @param {Models.BlobCopyFromURLOptionalParams} [leaseAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  copyFromURL(
    context: Context,
    source: BlobId,
    destination: BlobId,
    copySource: string,
    metadata: Models.BlobMetadata | undefined,
    tier: Models.AccessTier | undefined,
    leaseAccessConditions?: Models.BlobCopyFromURLOptionalParams
  ): Promise<Models.BlobPropertiesInternal>;

  /**
   * Update Tier for a blob.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.AccessTier} tier
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @returns {(Promise<200 | 202>)}
   * @memberof IBlobMetadataStore
   */
  setTier(
    context: Context,
    account: string,
    container: string,
    blob: string,
    tier: Models.AccessTier,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined
  ): Promise<200 | 202>;

  /**
   * Update blob block item in persistency layer. Will create if block doesn't exist.
   * Will also create a uncommitted block blob.
   *
   * @param {BlockModel} block
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  stageBlock(
    context: Context,
    block: BlockModel,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined
  ): Promise<void>;

  /**
   * Append block to an append blob.
   *
   * @param {Context} context
   * @param {BlockModel} block
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @param {Models.AppendPositionAccessConditions} [appendPositionAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  appendBlock(
    context: Context,
    block: BlockModel,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
    appendPositionAccessConditions?: Models.AppendPositionAccessConditions
  ): Promise<Models.BlobPropertiesInternal>;

  /**
   * Commit block list for a blob.
   *
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {{ blockName: string; blockCommitType: string }[]} blockList
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  commitBlockList(
    context: Context,
    blob: BlobModel,
    blockList: { blockName: string; blockCommitType: string }[],
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<void>;

  /**
   * Gets blocks list for a blob from persistency layer by account, container and blob names.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @param {(boolean | undefined)} isCommitted
   * @param {Context} context
   * @returns {Promise<{
   *     properties: Models.BlobProperties;
   *     uncommittedBlocks: Models.Block[];
   *     committedBlocks: Models.Block[];
   *   }>}
   * @memberof IBlobMetadataStore
   */
  getBlockList(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    isCommitted: boolean | undefined,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    modifiedAccessConditions: Models.ModifiedAccessConditions | undefined
  ): Promise<{
    properties: Models.BlobPropertiesInternal;
    uncommittedBlocks: Models.Block[];
    committedBlocks: Models.Block[];
  }>;

  /**
   * Upload new pages for page blob.
   *
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {number} start
   * @param {number} end
   * @param {IExtentChunk} persistency
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @param {Models.SequenceNumberAccessConditions} [sequenceNumberAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  uploadPages(
    context: Context,
    blob: BlobModel,
    start: number,
    end: number,
    persistency: IExtentChunk,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
    sequenceNumberAccessConditions?: Models.SequenceNumberAccessConditions
  ): Promise<Models.BlobPropertiesInternal>;

  /**
   * Clear range for a page blob.
   *
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {number} start
   * @param {number} end
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @param {Models.SequenceNumberAccessConditions} [sequenceNumberAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  clearRange(
    context: Context,
    blob: BlobModel,
    start: number,
    end: number,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
    sequenceNumberAccessConditions?: Models.SequenceNumberAccessConditions
  ): Promise<Models.BlobPropertiesInternal>;

  /**
   * Returns the list of valid page ranges for a page blob or snapshot of a page blob.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<GetPageRangeResponse>}
   * @memberof IBlobMetadataStore
   */
  getPageRanges(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot?: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<GetPageRangeResponse>;

  /**
   * Resize a page blob.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {number} blobContentLength
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  resizePageBlob(
    context: Context,
    account: string,
    container: string,
    blob: string,
    blobContentLength: number,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<Models.BlobPropertiesInternal>;

  /**
   * Update the sequence number of a page blob.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.SequenceNumberActionType} sequenceNumberAction
   * @param {(number | undefined)} blobSequenceNumber
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  updateSequenceNumber(
    context: Context,
    account: string,
    container: string,
    blob: string,
    sequenceNumberAction: Models.SequenceNumberActionType,
    blobSequenceNumber: number | undefined,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<Models.BlobPropertiesInternal>;

  /**
   * Gets uncommitted blocks list for a blob from persistency layer.
   */
  listUncommittedBlockPersistencyChunks(
    marker?: string,
    maxResults?: number
  ): Promise<[IExtentChunk[], string | undefined]>;

  /**
   * Set blob tags.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  setBlobTag(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    tags: Models.BlobTags | undefined,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<void>;

  /**
   * Get blob tags.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<BlobTags | undefined>}
   * @memberof IBlobMetadataStore
   */
  getBlobTag(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
  ): Promise<BlobTags | undefined>;

  /**
   * Seal blob.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  sealBlob(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    options: Models.AppendBlobSealOptionalParams,
  ): Promise<Models.BlobPropertiesInternal>;

}

export default IBlobMetadataStore;
