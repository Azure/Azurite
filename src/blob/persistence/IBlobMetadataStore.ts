import ICleaner from "../../common/ICleaner";
import { IDataStore } from "../../common/IDataStore";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";

/**
 * This model describes a chunk inside a persistency extent for a given extent ID.
 * A chunk points to a sub-range of an extent.
 *
 * @export
 * @interface IPersistencyChunk
 */
export interface IPersistencyChunk {
  id: string; // The persistency layer storage extent ID where the chunk belongs to
  offset: number; // Chunk offset inside the extent where chunk starts in bytes
  count: number; // Chunk length in bytes
}

export const ZERO_PERSISTENCY_CHUNK_ID = "*ZERO*";

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
export type GetContainerPropertiesRes = Models.ContainerItem;

// The response for getContainerAccessPolicy.
interface IGetContainerAccessPolicyRes {
  properties: Models.ContainerProperties;
  containerAcl?: Models.SignedIdentifier[];
}
export type GetContainerAccessPolicyRes = IGetContainerAccessPolicyRes;

// The params for setContainerAccessPolicy.
interface ISetContainerAccessPolicyParam {
  lastModified: Date;
  etag: string;
  containerAcl?: Models.SignedIdentifier[];
  publicAccess?: Models.PublicAccessType;
  leaseAccessConditions?: Models.LeaseAccessConditions;
}
export type SetContainerAccessPolicyParam = ISetContainerAccessPolicyParam;

// The response model for each lease-related request.
interface IContainerLeaseResModel {
  properties: Models.ContainerProperties;
  leaseId?: string;
  leaseTime?: number;
}
export type AcquireContainerLeaseRes = IContainerLeaseResModel;

export type ReleaseContainerLeaseRes = Models.ContainerProperties;

export type RenewContainerLeaseRes = IContainerLeaseResModel;

export type BreakContainerLeaseRes = IContainerLeaseResModel;

export type ChangeContainerLeaseRes = IContainerLeaseResModel;

/** MODELS FOR BLOBS */
interface IPersistencyPropertiesRequired {
  /**
   * A reference to persistency layer chunk of data.
   *
   * @type {IPersistencyChunk}
   * @memberof IPersistencyProperties
   */
  persistency: IPersistencyChunk;
}

interface IPersistencyPropertiesOptional {
  /**
   * A reference to persistency layer chunk of data.
   *
   * @type {IPersistencyChunk}
   * @memberof IPersistencyProperties
   */
  persistency?: IPersistencyChunk;
}

interface IBlockBlobAdditionalProperties {
  /**
   * False for uncommitted block blob, otherwise true.
   *
   * @type {boolean}
   * @memberof IBlobAdditionalProperties
   */
  isCommitted: boolean;
  leaseduration?: number;
  leaseId?: string;
  leaseExpireTime?: Date;
  leaseBreakExpireTime?: Date;

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
}

export type BlobModel = IBlobAdditionalProperties &
  IPageBlobAdditionalProperties &
  IBlockBlobAdditionalProperties &
  Models.BlobItem &
  IPersistencyPropertiesOptional;

// The response model for getContainerProperties.
interface IGetBlobPropertiesRes {
  properties: Models.BlobProperties;
  metadata?: Models.BlobMetadata;
}
export type GetBlobPropertiesRes = IGetBlobPropertiesRes;

// The response model for each lease-related request.
interface IBlobLeaseResModel {
  properties: Models.BlobProperties;
  leaseId?: string;
  leaseTime?: number;
}
export type AcquireBlobLeaseRes = IBlobLeaseResModel;

export type ReleaseBlobLeaseRes = Models.ContainerProperties;

export type RenewBlobLeaseRes = IBlobLeaseResModel;

export type BreakBlobLeaseRes = IBlobLeaseResModel;

export type ChangeBlobLeaseRes = IBlobLeaseResModel;

// The response model for create snapshot.
interface ICreateSnapshotRes {
  properties: Models.BlobProperties;
  snapshot: string;
}
export type CreateSnapshotRes = ICreateSnapshotRes;

// The model contain account name, container name, blob name and snapshot for blob.
interface IBlobId {
  account: string;
  container: string;
  blob: string;
  snapshot?: string;
}
export type BlobId = IBlobId;

// The model contain required attributes of pageblob for request getPageRanges.
interface IGetPageRangeRes {
  pageRangesInOrder?: PersistencyPageRange[];
  properties: Models.BlobProperties;
}
export type GetPageRangeRes = IGetPageRangeRes;

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
export interface IBlobMetadataStore extends IDataStore, ICleaner {
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
    account: string,
    prefix?: string,
    maxResults?: number,
    marker?: number
  ): Promise<[ContainerModel[], number | undefined]>;

  /**
   * Create a container.
   *
   * @param {ContainerModel} container
   * @param {Context} [context]
   * @returns {Promise<ContainerModel>}
   * @memberof IBlobMetadataStore
   */
  createContainer(
    container: ContainerModel,
    context?: Context
  ): Promise<ContainerModel>;

  /**
   * Get a container properties.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} [context]
   * @returns {(Promise<GetContainerPropertiesModel>)}
   * @memberof IBlobMetadataStore
   */
  getContainerProperties(
    account: string,
    container: string,
    context?: Context
  ): Promise<GetContainerPropertiesRes>;

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
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  deleteContainer(
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    context?: Context
  ): Promise<void>;

  /**
   * Set container metadata.
   *
   * @param {string} account
   * @param {string} container
   * @param {Date} lastModified
   * @param {string} etag
   * @param {IContainerMetadata} [metadata]
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  setContainerMetadata(
    account: string,
    container: string,
    lastModified: Date,
    etag: string,
    metadata?: IContainerMetadata,
    context?: Context
  ): Promise<void>;

  /**
   * Get container access policy.
   *
   * @param {string} account
   * @param {string} container
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Context} [context]
   * @returns {Promise<GetContainerAccessPolicyRes>}
   * @memberof IBlobMetadataStore
   */
  getContainerACL(
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    context?: Context
  ): Promise<GetContainerAccessPolicyRes>;

  /**
   * Set container access policy.
   *
   * @param {string} account
   * @param {string} container
   * @param {SetContainerAccessPolicyParam} setAclModel
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  setContainerACL(
    account: string,
    container: string,
    setAclModel: SetContainerAccessPolicyParam,
    context?: Context
  ): Promise<void>;

  /**
   * Acquire container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {Models.ContainerAcquireLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<AcquireContainerLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  acquireContainerLease(
    account: string,
    container: string,
    options: Models.ContainerAcquireLeaseOptionalParams,
    context: Context
  ): Promise<AcquireContainerLeaseRes>;

  /**
   * Release container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {Context} context
   * @returns {Promise<ReleaseContainerLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  releaseContainerLease(
    account: string,
    container: string,
    leaseId: string,
    context: Context
  ): Promise<ReleaseContainerLeaseRes>;

  /**
   * Renew container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {Context} context
   * @returns {Promise<RenewContainerLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  renewContainerLease(
    account: string,
    container: string,
    leaseId: string,
    context: Context
  ): Promise<RenewContainerLeaseRes>;

  /**
   * Break container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {(number | undefined)} breakPeriod
   * @param {Context} context
   * @returns {Promise<BreakContainerLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  breakContainerLease(
    account: string,
    container: string,
    breakPeriod: number | undefined,
    context: Context
  ): Promise<BreakContainerLeaseRes>;

  /**
   * Change container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Context} context
   * @returns {Promise<ChangeContainerLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  changeContainerLease(
    account: string,
    container: string,
    leaseId: string,
    proposedLeaseId: string,
    context: Context
  ): Promise<ChangeContainerLeaseRes>;

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
    account: string,
    container: string,
    context?: Context
  ): Promise<void>;

  /**
   * List blobs with query conditions specified.
   *
   * @param {string} [account]
   * @param {string} [container]
   * @param {string} [blob]
   * @param {string} [prefix]
   * @param {number} [maxResults]
   * @param {string} [marker]
   * @param {boolean} [includeSnapshots]
   * @returns {(Promise<[BlobModel[], string | undefined]>)}
   * @memberof IBlobMetadataStore
   */
  listBlobs(
    account?: string,
    container?: string,
    blob?: string,
    prefix?: string,
    maxResults?: number,
    marker?: string,
    includeSnapshots?: boolean
  ): Promise<[BlobModel[], string | undefined]>;

  /**
   * Create blob item in persistency layer. Will replace if blob exists.
   *
   * @param {BlobModel} blob
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  createBlob(blob: BlobModel, context?: Context): Promise<void>;

  /**
   * Create snapshot.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Context} context
   * @returns {Promise<CreateSnapshotRes>}
   * @memberof IBlobMetadataStore
   */
  createSnapshot(
    account: string,
    container: string,
    blob: string,
    context: Context
  ): Promise<CreateSnapshotRes>;

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   * Will return block list or page list as well for downloading.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {Context} context
   * @returns {Promise<BlobModel>}
   * @memberof IBlobMetadataStore
   */
  downloadBlob(
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    context: Context
  ): Promise<BlobModel>;

  /**
   * Get blob properties.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {Context} context
   * @returns {Promise<GetBlobPropertiesRes>}
   * @memberof IBlobMetadataStore
   */
  getBlobProperties(
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    context: Context
  ): Promise<GetBlobPropertiesRes>;

  /**
   * Delete blob or its snapshots.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.BlobDeleteMethodOptionalParams} options
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  deleteBlob(
    account: string,
    container: string,
    blob: string,
    options: Models.BlobDeleteMethodOptionalParams,
    context: Context
  ): Promise<void>;

  /**
   * Set blob HTTP headers.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {(Models.BlobHTTPHeaders | undefined)} blobHTTPHeaders
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  setBlobHTTPHeaders(
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    blobHTTPHeaders: Models.BlobHTTPHeaders | undefined,
    context: Context
  ): Promise<Models.BlobProperties>;

  /**
   * Set blob metadata.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  setBlobMetadata(
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    metadata: Models.BlobMetadata | undefined,
    context: Context
  ): Promise<Models.BlobProperties>;

  /**
   * Acquire blob lease.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.BlobAcquireLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<AcquireBlobLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  acquireBlobLease(
    account: string,
    container: string,
    blob: string,
    options: Models.BlobAcquireLeaseOptionalParams,
    context: Context
  ): Promise<AcquireBlobLeaseRes>;

  /**
   * Release container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @param {Context} context
   * @returns {Promise<ReleaseBlobLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  releaseBlobLease(
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    context: Context
  ): Promise<ReleaseBlobLeaseRes>;

  /**
   * Renew blob lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @param {Context} context
   * @returns {Promise<RenewBlobLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  renewBlobLease(
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    context: Context
  ): Promise<RenewBlobLeaseRes>;

  /**
   * Change blob lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Context} context
   * @returns {Promise<ChangeBlobLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  changeBlobLease(
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    proposedLeaseId: string,
    context: Context
  ): Promise<ChangeBlobLeaseRes>;

  /**
   * Break blob lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(number | undefined)} breakPeriod
   * @param {Context} context
   * @returns {Promise<BreakBlobLeaseRes>}
   * @memberof IBlobMetadataStore
   */
  breakBlobLease(
    account: string,
    container: string,
    blob: string,
    breakPeriod: number | undefined,
    context: Context
  ): Promise<BreakBlobLeaseRes>;

  /**
   * Check the existence of a blob.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  checkBlobExist(
    account: string,
    container: string,
    blob: string,
    snapshot?: string,
    context?: Context
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
   * @param {BlobId} source
   * @param {BlobId} destination
   * @param {string} copySource
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {(Models.AccessTier | undefined)} tier
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  startCopyFromURL(
    source: BlobId,
    destination: BlobId,
    copySource: string,
    metadata: Models.BlobMetadata | undefined,
    tier: Models.AccessTier | undefined,
    context: Context
  ): Promise<Models.BlobProperties>;

  /**
   * Update Tier for a blob.
   *
   * @param {BlobModel} blob
   * @returns {Promise<200 | 202>}
   * @memberof IBlobMetadataStore
   */
  setTier(
    account: string,
    container: string,
    blob: string,
    tier: Models.AccessTier,
    context: Context
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
  stageBlock(block: BlockModel, context: Context): Promise<void>;

  /**
   * Commit block list for a blob.
   *
   * @param {BlobModel} blob
   * @param {{ blockName: string; blockCommitType: string }[]} blockList
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  commitBlockList(
    blob: BlobModel,
    blockList: { blockName: string; blockCommitType: string }[],
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    context: Context
  ): Promise<void>;

  /**
   * Gets blocks list for a blob from persistency layer by account, container and blob names.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
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
    account: string,
    container: string,
    blob: string,
    isCommitted: boolean | undefined,
    context: Context
  ): Promise<{
    properties: Models.BlobProperties;
    uncommittedBlocks: Models.Block[];
    committedBlocks: Models.Block[];
  }>;

  /**
   * Upload new pages for pageblob.
   *
   * @param {BlobModel} blob
   * @param {number} start
   * @param {number} end
   * @param {IPersistencyChunk} persistencycontext
   * @param {Context} [context]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  uploadPages(
    blob: BlobModel,
    start: number,
    end: number,
    persistencycontext: IPersistencyChunk,
    context?: Context
  ): Promise<Models.BlobProperties>;

  /**
   * Clear range for a pageblob.
   *
   * @param {BlobModel} blob
   * @param {number} start
   * @param {number} end
   * @param {Context} [context]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  clearRange(
    blob: BlobModel,
    start: number,
    end: number,
    context?: Context
  ): Promise<Models.BlobProperties>;

  /**
   * Returns the list of valid page ranges for a page blob or snapshot of a page blob.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @param {Context} [context]
   * @returns {Promise<GetPageRangeRes>}
   * @memberof IBlobMetadataStore
   */
  getPageRanges(
    account: string,
    container: string,
    blob: string,
    snapshot?: string,
    context?: Context
  ): Promise<GetPageRangeRes>;

  /**
   * Resize a page blob.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {number} blobContentLength
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  resizePageBlob(
    account: string,
    container: string,
    blob: string,
    blobContentLength: number,
    context: Context
  ): Promise<Models.BlobProperties>;

  /**
   * Upadate the sequence number of a page blob.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.SequenceNumberActionType} sequenceNumberAction
   * @param {(number | undefined)} blobSequenceNumber
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof IBlobMetadataStore
   */
  updateSequenceNumber(
    account: string,
    container: string,
    blob: string,
    sequenceNumberAction: Models.SequenceNumberActionType,
    blobSequenceNumber: number | undefined,
    context: Context
  ): Promise<Models.BlobProperties>;

  /**
   * Gets blocks list for a blob from persistency layer by account, container and blob names.
   *
   * @template T
   * @param {string} [account]
   * @param {string} [container]
   * @param {string} [blob]
   * @param {boolean} [isCommitted]
   * @returns {Promise<T[]>}
   * @memberof IBlobMetadataStore
   */
  listBlocks<T extends BlockModel>(
    account?: string,
    container?: string,
    blob?: string,
    isCommitted?: boolean
  ): Promise<T[]>;

  /**
   * Return a referred extent iterator for GC.
   *
   * @returns {AsyncIterator<IPersistencyChunk[]>}
   * @memberof IBlobMetadataStore
   */
  iteratorReferredExtents(): AsyncIterator<IPersistencyChunk[]>;
}

export default IBlobMetadataStore;
