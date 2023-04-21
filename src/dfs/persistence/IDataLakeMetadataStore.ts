import IBlobMetadataStore, {
  BlobModel,
  BlobPrefixModel,
  BlockModel,
  ContainerModel
} from "../../blob/persistence/IBlobMetadataStore";
import ICleaner from "../../common/ICleaner";
import IDataStore from "../../common/IDataStore";
import IGCExtentProvider from "../../common/IGCExtentProvider";
import * as Models from "../generated/artifacts/models";
import Context from "../../blob/generated/Context";

/**
 * Persistency layer metadata storage interface.
 *
 * TODO: Integrate cache layer to cache account, container & blob metadata.
 *
 * @export
 * @interface IDataLakeMetadataStore
 * @extends {IDataStore}
 */
export interface IDataLakeMetadataStore
  extends IBlobMetadataStore,
    IGCExtentProvider,
    IDataStore,
    ICleaner {
  /**
   * Set container properties.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} [properties]
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  setContainerProperties(
    context: Context,
    account: string,
    container: string,
    properties: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<ContainerModel>;

  list(
    lisDirectories: boolean | undefined,
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

  /**
   * Update blob block item in persistency layer. Will create if block doesn't exist.
   * Will also create a uncommitted block blob.
   *
   * @param {BlockModel} block
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  appendData(
    context: Context,
    block: BlockModel,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined
  ): Promise<void>;

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
  flush(
    context: Context,
    blob: BlobModel,
    blockList: { blockName: string; blockCommitType: string }[],
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<void>;

  /***************************************************************************
   *
   * New DataLake specific functions
   *
   ***************************************************************************/
  /**
   * Rename Directory
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} sourceContainer
   * @param {string} sourceDirectory
   * @param {string} targetContainer
   * @param {string} targetDirectory
   * @param {Models.DirectoryRenameOptionalParams} options
   * @returns {Promise<DirectoryModel>}
   * @memberof IBlobMetadataStore
   */
  renameDirectory(
    context: Context,
    account: string,
    sourceContainer: string,
    sourceDirectory: string,
    targetContainer: string,
    targetDirectory: string,
    options: Models.PathCreateOptionalParams
  ): Promise<BlobModel>;

  /**
   * List paths in Directory
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} directory
   * @param {boolean} recursive
   * @param {Models.FileSystemListPathsOptionalParams} options
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  listPaths(
    context: Context,
    account: string,
    container: string,
    directory: string,
    recursive: boolean,
    options: Models.FileSystemListPathsOptionalParams
  ): Promise<[Models.Path[], string | undefined]>;

  /**
   * Delete Directory
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} directory
   * @param {boolean} recursiveDirectoryDelete
   * @param {Models.DirectoryDeleteMethodOptionalParams} options
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  deleteDirectory(
    context: Context,
    account: string,
    container: string,
    directory: string,
    recursiveDirectoryDelete: boolean,
    options: Models.PathDeleteMethodOptionalParams
  ): Promise<void>;

  /**
   * Rename Blob
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} sourceContainer
   * @param {string} sourceBlob
   * @param {string} targetContainer
   * @param {string} targetBlob
   * @param {Models.PathCreateOptionalParams} options
   * @returns {Promise<BlobModel>}
   * @memberof IBlobMetadataStore
   */
  renameBlob(
    context: Context,
    account: string,
    sourceContainer: string,
    sourceBlob: string,
    targetContainer: string,
    targetBlob: string,
    options: Models.PathCreateOptionalParams
  ): Promise<BlobModel>;

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
  getModel(
    context: Context,
    account: string,
    container: string,
    blob: string,
    forceExist: true,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
    validateRead?: boolean
  ): Promise<BlobModel>;

  getModel(
    context: Context,
    account: string,
    container: string,
    blob: string,
    forceExist: false | undefined,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
    validateRead?: boolean
  ): Promise<BlobModel | undefined>;

  getModel(
    context: Context,
    account: string,
    container: string,
    blob: string,
    forceExist?: boolean,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
    validateRead?: boolean
  ): Promise<BlobModel | undefined>;
}

export default IDataLakeMetadataStore;
