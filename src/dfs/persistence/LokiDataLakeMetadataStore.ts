import {
  BlobModel,
  BlobPrefixModel,
  BlockModel,
  ContainerModel,
  PersistencyBlockModel
} from "../../blob/persistence/IBlobMetadataStore";
import LokiBlobMetadataStore from "../../blob/persistence/LokiBlobMetadataStore";
import { DEFAULT_LIST_BLOBS_MAX_RESULTS } from "../../blob/utils/constants";
import IGCExtentProvider from "../../common/IGCExtentProvider";
import { newEtag } from "../../common/utils/utils";
import { validateReadConditions } from "../../blob/conditions/ReadConditionalHeadersValidator";
import { validateWriteConditions } from "../../blob/conditions/WriteConditionalHeadersValidator";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../../blob/generated/Context";
import BlobLeaseAdapter from "../../blob/lease/BlobLeaseAdapter";
import BlobLeaseSyncer from "../../blob/lease/BlobLeaseSyncer";
import BlobReadLeaseValidator from "../../blob/lease/BlobReadLeaseValidator";
import BlobWriteLeaseSyncer from "../../blob/lease/BlobWriteLeaseSyncer";
import BlobWriteLeaseValidator from "../../blob/lease/BlobWriteLeaseValidator";
import ContainerLeaseAdapter from "../../blob/lease/ContainerLeaseAdapter";
import ContainerReadLeaseValidator from "../../blob/lease/ContainerReadLeaseValidator";
import { ILease } from "../../blob/lease/ILeaseState";
import LeaseFactory from "../../blob/lease/LeaseFactory";
import { removeSlash } from "../utils/utils";
import IDataLakeMetadataStore from "./IDataLakeMetadataStore";
import PageWithDelimiter from "../../blob/persistence/PageWithDelimiter";
import BlobReferredExtentsAsyncIterator from "../../blob/persistence/BlobReferredExtentsAsyncIterator";

/**
 * This is a metadata source implementation for blob based on loki DB.
 *
 * Notice that, following design is for emulator purpose only, and doesn't design for best performance.
 * We may want to optimize the persistency layer performance in the future. Such as by distributing metadata
 * into different collections, or make binary payload write as an append-only pattern.
 *
 * Loki DB includes following collections and documents:
 *
 * -- SERVICE_PROPERTIES_COLLECTION // Collection contains service properties
 *                                  // Default collection name is $SERVICES_COLLECTION$
 *                                  // Each document maps to 1 account blob service
 *                                  // Unique document properties: accountName
 * -- CONTAINERS_COLLECTION  // Collection contains all containers
 *                           // Default collection name is $CONTAINERS_COLLECTION$
 *                           // Each document maps to 1 container
 *                           // Unique document properties: accountName, (container)name
 * -- BLOBS_COLLECTION       // Collection contains all blobs
 *                           // Default collection name is $BLOBS_COLLECTION$
 *                           // Each document maps to a blob
 *                           // Unique document properties: accountName, containerName, (blob)name, snapshot
 * -- BLOCKS_COLLECTION      // Block blob blocks collection includes all UNCOMMITTED blocks
 *                           // Unique document properties: accountName, containerName, blobName, name, isCommitted
 *
 * @export
 * @class LokiBlobMetadataStore
 */
export default class LokiDataLakeMetadataStore
  extends LokiBlobMetadataStore
  implements IDataLakeMetadataStore, IGCExtentProvider
{
  protected readonly PATHS_COLLECTION = "$PATHS_COLLECTION$";

  public constructor(public readonly lokiDBPath: string) {
    super(lokiDBPath);
  }

  public async init(): Promise<void> {
    if (this.db.getCollection(this.PATHS_COLLECTION) === null) {
      this.db.addCollection(this.PATHS_COLLECTION, {
        indices: ["accountName", "containerName", "name"] // Optimize for find operation
      });
    }

    super.init();
  }

  public iteratorExtents(): AsyncIterator<string[]> {
    return new BlobReferredExtentsAsyncIterator(this);
  }

  /**
   * Set container properties.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} properties
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  async setContainerProperties(
    context: Context,
    account: string,
    container: string,
    properties: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<ContainerModel> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerWithLeaseUpdated(
      account,
      container,
      context,
      false
    );

    validateWriteConditions(context, modifiedAccessConditions, doc);

    if (!doc) {
      throw StorageErrorFactory.getContainerNotFound(context);
    }

    new ContainerReadLeaseValidator(leaseAccessConditions).validate(
      new ContainerLeaseAdapter(doc),
      context
    );

    doc.fileSystemProperties = properties;
    coll.update(doc);
    return doc;
  }

  public async list(
    lisDirectories: boolean | undefined,
    context: Context,
    account: string,
    container: string,
    delimiter?: string,
    blob?: string,
    prefix: string = "",
    maxResults: number = DEFAULT_LIST_BLOBS_MAX_RESULTS,
    marker: string = "",
    includeSnapshots?: boolean,
    includeUncommittedBlobs?: boolean
  ): Promise<[BlobModel[], BlobPrefixModel[], string | undefined]> {
    const query: any = {};
    if (prefix !== "") {
      query.name = { $regex: `^${this.escapeRegex(prefix)}` };
    }
    if (blob !== undefined) {
      query.name = blob;
    }
    if (account !== undefined) {
      query.accountName = account;
    }
    if (container !== undefined) {
      query.containerName = container;
    }

    if (lisDirectories !== undefined) {
      query.isDirectory = lisDirectories;
    }

    if (lisDirectories !== false) {
      includeSnapshots = true;
      includeUncommittedBlobs = true;
    }

    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const page = new PageWithDelimiter<BlobModel>(
      maxResults,
      delimiter,
      prefix
    );
    const readPage = async (offset: number): Promise<BlobModel[]> => {
      return coll
        .chain()
        .find(query)
        .where((obj) => {
          return obj.name > marker!;
        })
        .where((obj) => {
          return includeSnapshots ? true : obj.snapshot.length === 0;
        })
        .where((obj) => {
          return includeUncommittedBlobs ? true : obj.isCommitted;
        })
        .sort((obj1, obj2) => {
          if (obj1.name === obj2.name) return 0;
          if (obj1.name > obj2.name) return 1;
          return -1;
        })
        .offset(offset)
        .limit(maxResults)
        .data();
    };

    const nameItem = (item: BlobModel) => {
      return item.name;
    };

    const [blobItems, blobPrefixes, nextMarker] = await page.fill(
      readPage,
      nameItem
    );

    let blobModels = blobItems.map((doc) => {
      doc.properties.contentMD5 = this.restoreUint8Array(
        doc.properties.contentMD5
      );
      return LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(doc),
        context
      ).sync(new BlobLeaseSyncer(doc));
    });
    blobModels = blobModels.filter((model) =>
      this.validateExpireConditionsDfs(context, model, false)
    );
    return [blobModels, blobPrefixes, nextMarker];
  }

  /**
   * Update blob block item in persistency layer. Will create if block doesn't exist.
   * Will also create a uncommitted block blob.
   *
   * @param {BlockModel} block
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async appendData(
    context: Context,
    block: BlockModel,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<void> {
    await this.checkContainerExist(
      context,
      block.accountName,
      block.containerName
    );

    const blobColl = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = blobColl.findOne({
      accountName: block.accountName,
      containerName: block.containerName,
      name: block.blobName
    });

    const valid = this.validateExpireConditionsDfs(context, blobDoc, false);
    if (!blobDoc || !valid) {
      const etag = newEtag();
      const newBlob: BlobModel = {
        deleted: false,
        accountName: block.accountName,
        containerName: block.containerName,
        name: block.blobName,
        properties: {
          creationTime: context.startTime,
          lastModified: context.startTime!,
          etag,
          contentLength: 0,
          blobType: Models.BlobType.BlockBlob
        },
        snapshot: "",
        isCommitted: false,
      };
      blobColl.insert(newBlob);
    } else {
      if (blobDoc.properties.blobType !== Models.BlobType.AppendBlob) {
        throw StorageErrorFactory.getBlobInvalidBlobType(context);
      }

      LeaseFactory.createLeaseState(new BlobLeaseAdapter(blobDoc), context)
        .validate(new BlobWriteLeaseValidator(leaseAccessConditions))
        .sync(new BlobWriteLeaseSyncer(blobDoc));
    }

    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    const blockDoc = coll.findOne({
      accountName: block.accountName,
      containerName: block.containerName,
      blobName: block.blobName,
      name: block.name,
      isCommitted: block.isCommitted
    });

    if (blockDoc) {
      coll.remove(blockDoc);
    }

    delete (block as any).$loki;
    coll.insert(block);
  }

  /**
   * Commit block list for a blob.
   *
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {{ blockName: string; blockCommitType: string }[]} blockList
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async flush(
    context: Context,
    blob: BlobModel,
    blockList: { blockName: string; blockCommitType: string }[],
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<void> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      blob.accountName,
      blob.containerName,
      blob.name,
      blob.snapshot,
      context,
      // XStore allows commit block list with empty block list to create a block blob without stage block call
      // In this case, there will no existing blob doc exists
      false
    );

    this.validateExpireConditionsDfs(context, doc, true);
    validateWriteConditions(context, modifiedAccessConditions, doc);

    // Create if not exists
    if (
      modifiedAccessConditions &&
      modifiedAccessConditions.ifNoneMatch === "*" &&
      doc &&
      doc.isCommitted
    ) {
      throw StorageErrorFactory.getBlobAlreadyExists(context);
    }

    let lease: ILease | undefined;
    if (doc) {
      if (doc.properties.blobType !== Models.BlobType.AppendBlob) {
        throw StorageErrorFactory.getBlobInvalidBlobType(context);
      }

      lease = new BlobLeaseAdapter(doc);
      new BlobWriteLeaseValidator(leaseAccessConditions).validate(
        lease,
        context
      );
    }

    // Get all blocks in persistency layer
    const blockColl = this.db.getCollection(this.BLOCKS_COLLECTION);
    const pUncommittedBlocks = blockColl
      .chain()
      .find({
        accountName: blob.accountName,
        containerName: blob.containerName,
        blobName: blob.name
      })
      .data();

    const pUncommittedBlocksMap: Map<string, PersistencyBlockModel> = new Map(); // persistencyUncommittedBlocksMap
    for (const pBlock of pUncommittedBlocks) {
      if (!pBlock.isCommitted) {
        pUncommittedBlocksMap.set(pBlock.name, pBlock);
      }
    }

    const selectedBlockList: PersistencyBlockModel[] =
      doc && doc.committedBlocksInOrder ? doc.committedBlocksInOrder : [];
    for (const block_1 of blockList) {
      const pUncommittedBlock = pUncommittedBlocksMap.get(block_1.blockName);
      if (pUncommittedBlock === undefined) {
        throw StorageErrorFactory.getInvalidBlockList(context);
      } else {
        selectedBlockList.push(pUncommittedBlock);
      }
    }

    if (doc) {
      // Commit block list
      doc.properties.blobType = blob.properties.blobType;
      doc.properties.lastModified = blob.properties.lastModified;
      doc.committedBlocksInOrder = selectedBlockList;
      doc.isCommitted = true;
      doc.metadata = blob.metadata;
      doc.properties.accessTier = blob.properties.accessTier;
      doc.properties.accessTierInferred = blob.properties.accessTierInferred;
      doc.properties.etag = blob.properties.etag;
      doc.properties.cacheControl = blob.properties.cacheControl;
      doc.properties.contentType = blob.properties.contentType;
      doc.properties.contentMD5 = blob.properties.contentMD5;
      doc.properties.contentEncoding = blob.properties.contentEncoding;
      doc.properties.contentLanguage = blob.properties.contentLanguage;
      doc.properties.contentDisposition = blob.properties.contentDisposition;
      doc.properties.contentLength = selectedBlockList
        .map((block) => block.size)
        .reduce((total, val) => {
          return total + val;
        }, 0);

      // set lease state to available if it's expired
      if (lease) {
        new BlobWriteLeaseSyncer(doc).sync(lease);
      }

      coll.update(doc);
    } else {
      blob.committedBlocksInOrder = selectedBlockList;
      blob.properties.contentLength = selectedBlockList
        .map((block) => block.size)
        .reduce((total, val) => {
          return total + val;
        }, 0);
      coll.insert(blob);
    }

    blockColl.findAndRemove({
      accountName: blob.accountName,
      containerName: blob.containerName,
      blobName: blob.name
    });
  }

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
  async listPaths(
    context: Context,
    account: string,
    container: string,
    directory: string,
    recursive: boolean,
    options: Models.FileSystemListPathsOptionalParams
  ): Promise<[Models.Path[], string | undefined]> {
    directory = removeSlash(directory);
    const paths: Models.Path[] = [];

    if (directory)
      await this.getModel(context, account, container, directory, true);
    const [blobs, , nextMarker] = await this.list(
      undefined,
      context,
      account,
      container,
      recursive ? undefined : "/",
      undefined,
      directory ? directory + "/" : directory,
      options.maxResults,
      options.continuation
    );
    blobs.forEach((blob) => {
      paths.push({
        name: blob.name,
        isDirectory: blob.isDirectory ? true : undefined,
        lastModified: blob.properties.lastModified,
        etag: blob.properties.etag,
        contentLength: blob.properties.contentLength,
        owner: blob.owner,
        group: blob.group,
        permissions: blob.permissions
      });
    });

    return [paths, nextMarker];
  }

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
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  public async renameDirectory(
    context: Context,
    account: string,
    sourceContainer: string,
    sourceDirectory: string,
    targetContainer: string,
    targetDirectory: string,
    options: Models.PathCreateOptionalParams
  ): Promise<BlobModel> {
    sourceDirectory = removeSlash(sourceDirectory);
    targetDirectory = removeSlash(targetDirectory);

    const dirModel = await this.getModel(
      context,
      account,
      targetContainer,
      targetDirectory,
      false
    );

    if (
      options.modifiedAccessConditions &&
      options.modifiedAccessConditions.ifNoneMatch === "*" &&
      dirModel
    ) {
      throw StorageErrorFactory.getBlobAlreadyExists(context);
    }

    const [paths] = await this.listPaths(
      context,
      account,
      sourceContainer,
      sourceDirectory,
      true,
      options
    );

    paths.forEach(async (path) => {
      await this.rename(
        path.isDirectory!,
        context,
        account,
        sourceContainer,
        path.name!,
        targetContainer,
        targetDirectory + path.name!.substring(sourceDirectory.length),
        options
      );
    });

    await this.rename(
      true,
      context,
      account,
      sourceContainer,
      sourceDirectory,
      targetContainer,
      targetDirectory,
      options
    );
    const res = await this.getModel(
      context,
      account,
      targetContainer,
      targetDirectory,
      true
    );
    return res!;
  }

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
  public async deleteDirectory(
    context: Context,
    account: string,
    container: string,
    directory: string,
    recursiveDirectoryDelete: boolean,
    options: Models.PathDeleteMethodOptionalParams
  ): Promise<void> {
    directory = removeSlash(directory);
    await this.checkContainerExist(context, account, container);

    const dir: BlobModel = await this.db
      .getCollection(this.BLOBS_COLLECTION)
      .findOne({
        accountName: account,
        containerName: container,
        name: directory
      });

    validateWriteConditions(context, options.modifiedAccessConditions, dir);

    if (dir === null || dir === undefined) {
      throw StorageErrorFactory.getBlobNotFound(context);
    }

    const [blobs] = await this.list(
      undefined,
      context,
      account,
      container,
      undefined,
      undefined,
      directory ? directory + "/" : directory,
      DEFAULT_LIST_BLOBS_MAX_RESULTS,
      undefined,
      true,
      true
    );

    if (blobs.length > 0 && !recursiveDirectoryDelete) {
      throw StorageErrorFactory.getInvalidOperation(
        context,
        "Can't Delete non empty folder with non recursive flag"
      );
    } else {
      const options: Models.PathDeleteMethodOptionalParams = {
        deleteSnapshots: Models.DeleteSnapshotsOptionType.Include
      };

      for (const blob of blobs) {
        await this.deleteBlob(
          context,
          account,
          container,
          blob.name,
          options
        );
      }
    }

    await this.deleteBlob(
      context,
      account,
      container,
      dir.name,
      options
    );
  }

  /**
   * Rename Blob
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} source
   * @param {string} target
   * @param {Models.BlobDeleteMethodOptionalParams} options
   * @returns {Promise<BlobModel>}
   * @memberof LokiBlobMetadataStore
   */
  public async renameBlob(
    context: Context,
    account: string,
    sourceContainer: string,
    sourceBlob: string,
    targetContainer: string,
    targetBlob: string,
    options: Models.PathCreateOptionalParams
  ): Promise<BlobModel> {
    return this.rename(
      false,
      context,
      account,
      sourceContainer,
      sourceBlob,
      targetContainer,
      targetBlob,
      options
    );
  }

  public async rename(
    isDirectory: boolean,
    context: Context,
    account: string,
    sourceContainer: string,
    sourceBlob: string,
    targetContainer: string,
    targetBlob: string,
    options: Models.PathCreateOptionalParams
  ): Promise<BlobModel> {
    const target = await this.getModel(
      context,
      account,
      targetContainer,
      targetBlob,
      false,
      options.leaseAccessConditions,
      options.modifiedAccessConditions,
      false
    );

    validateWriteConditions(
      context,
      options.modifiedAccessConditions,
      target
    );

    if (
      options.modifiedAccessConditions &&
      options.modifiedAccessConditions.ifNoneMatch === "*" &&
      target
    ) {
      throw StorageErrorFactory.getBlobAlreadyExists(context);
    }

    if (target) {
      isDirectory
        ? await this.deleteDirectory(
            context,
            account,
            targetContainer,
            targetBlob,
            true,
            options
          )
        : await this.deleteBlob(
            context,
            account,
            targetContainer,
            targetBlob,
            options
          );
    }

    const model = await this.getModel(
      context,
      account,
      sourceContainer,
      sourceBlob
    );

    const newModel: BlobModel = {
      ...model,
      containerName: targetContainer,
      name: targetBlob
    };

    await this.createBlob(
      context,
      newModel,
      options.leaseAccessConditions,
      options.modifiedAccessConditions
    );

    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    coll.findAndRemove({
      accountName: account,
      containerName: sourceContainer,
      name: sourceBlob
    });
    return model;
  }

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   * Will return block list or page list as well for downloading.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot=""]
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<BlobModel>}
   * @memberof LokiBlobMetadataStore
   */
  getModel(
    context: Context,
    account: string,
    container: string,
    blob: string,
    forceExist?: true,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
    validateRead?: boolean
  ): Promise<BlobModel>;

  getModel(
    context: Context,
    account: string,
    container: string,
    blob: string,
    forceExist: false,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
    validateRead?: boolean
  ): Promise<BlobModel | undefined>;

  public async getModel(
    context: Context,
    account: string,
    container: string,
    blob: string,
    forceExists: boolean = true,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions,
    validateRead: boolean = true
  ): Promise<BlobModel | undefined> {
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      "",
      context,
      false,
      true
    );

    if (validateRead) {
      validateReadConditions(context, modifiedAccessConditions, doc);
    }

    if (!doc) {
      if (!forceExists) return undefined;
      throw StorageErrorFactory.getBlobNotFound(context);
    }

    new BlobReadLeaseValidator(leaseAccessConditions).validate(
      new BlobLeaseAdapter(doc),
      context
    );

    return doc;
  }

  private validateExpireConditionsDfs(
    context: Context | undefined,
    model: BlobModel | undefined,
    throwError: boolean
  ): boolean {
    const now = new Date();
    if (
      model &&
      model.properties.expiresOn !== undefined &&
      model.properties.expiresOn < now
    ) {
      const coll = this.db.getCollection(this.BLOBS_COLLECTION);
      coll.remove(model);
      if (throwError && context !== undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      return false;
    }

    return true;
  }
}
