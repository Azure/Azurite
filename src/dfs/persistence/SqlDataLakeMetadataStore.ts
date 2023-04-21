import { Op } from "sequelize";

import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../../blob/generated/Context";
import { removeSlash } from "../utils/utils";
import SqlBlobMetadataStore, {
  BlobsModel,
  BlocksModel,
  ContainersModel
} from "../../blob/persistence/SqlBlobMetadataStore";
import IDataLakeMetadataStore from "./IDataLakeMetadataStore";
import {
  BlobModel,
  BlobPrefixModel,
  BlockModel,
  ContainerModel,
  PersistencyBlockModel
} from "../../blob/persistence/IBlobMetadataStore";
import { validateWriteConditions } from "../../blob/conditions/WriteConditionalHeadersValidator";
import LeaseFactory from "../../blob/lease/LeaseFactory";
import ContainerReadLeaseValidator from "../../blob/lease/ContainerReadLeaseValidator";
import { DEFAULT_LIST_BLOBS_MAX_RESULTS } from "../../blob/utils/constants";
import BlobLeaseAdapter from "../../blob/lease/BlobLeaseAdapter";
import BlobLeaseSyncer from "../../blob/lease/BlobLeaseSyncer";
import PageWithDelimiter from "../../blob/persistence/PageWithDelimiter";
import BlobWriteLeaseValidator from "../../blob/lease/BlobWriteLeaseValidator";
import BlobWriteLeaseSyncer from "../../blob/lease/BlobWriteLeaseSyncer";
import { validateReadConditions } from "../../blob/conditions/ReadConditionalHeadersValidator";
import BlobReadLeaseValidator from "../../blob/lease/BlobReadLeaseValidator";

/**
 * A SQL based Blob metadata storage implementation based on Sequelize.
 * Refer to CONTRIBUTION.md for how to setup SQL database environment.
 *
 * @export
 * @class SqlDataLakeMetadataStore
 * @implements {IBlobMetadataStore}
 */
export default class SqlDataLakeMetadataStore
  extends SqlBlobMetadataStore
  implements IDataLakeMetadataStore
{
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
    return await this.sequelize.transaction(async (t) => {
      /* Transaction starts */
      const findResult = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      if (findResult === null || findResult === undefined) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      const containerModel = this.convertDbModelToContainerModel(findResult);
      validateWriteConditions(
        context,
        modifiedAccessConditions,
        containerModel
      );

      LeaseFactory.createLeaseState(
        this.convertDbModelToLease(findResult),
        context
      ).validate(new ContainerReadLeaseValidator(leaseAccessConditions));

      await ContainersModel.update(
        {
          properties
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      containerModel.fileSystemProperties = properties;
      return containerModel;
      /* Transaction ends */
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

    if (directory) {
      const model = await this.getModel(
        context,
        account,
        container,
        directory,
        true
      );

      if (!model.isDirectory) {
        throw StorageErrorFactory.getPathConflict(context);
      }
    }

    const [blobs, , nextMarker] = await this.list(
      undefined,
      context,
      account,
      container,
      recursive ? undefined : "/",
      undefined,
      directory ? directory + "/" : undefined,
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
    await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const directoryFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: directory,
          isDirectory: true
        },
        transaction: t
      });

      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        directoryFindResult
          ? this.convertDbModelToBlobModel(directoryFindResult) // TODO: Reduce double convert
          : undefined
      );

      if (directoryFindResult === null || directoryFindResult === undefined) {
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

      if (blobs.length > 1 && !recursiveDirectoryDelete) {
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

      await this.deleteBlob(context, account, container, directory, options);
    });
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
    marker?: string,
    includeSnapshots?: boolean,
    includeUncommittedBlobs?: boolean
  ): Promise<[BlobModel[], BlobPrefixModel[], any | undefined]> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const whereQuery: any = {
        accountName: account,
        containerName: container
      };

      if (blob !== undefined) {
        whereQuery.blobName = blob;
      } else {
        if (prefix.length > 0) {
          whereQuery.blobName = {
            [Op.like]: `${prefix}%`
          };
        }

        if (marker !== undefined) {
          if (whereQuery.blobName !== undefined) {
            whereQuery.blobName[Op.gt] = marker;
          } else {
            whereQuery.blobName = {
              [Op.gt]: marker
            };
          }
        }
      }
      if (lisDirectories !== false) {
        includeSnapshots = true;
        includeUncommittedBlobs = true;
      }
      if (lisDirectories !== undefined) {
        whereQuery.isDirectory = lisDirectories;
      }
      if (!includeSnapshots) {
        whereQuery.snapshot = "";
      }
      if (!includeUncommittedBlobs) {
        whereQuery.isCommitted = true;
      }

      whereQuery.deleting = 0;
      const leaseUpdateMapper = (model: BlobsModel) => {
        const blobModel = this.convertDbModelToBlobModel(model);
        return LeaseFactory.createLeaseState(
          new BlobLeaseAdapter(blobModel),
          context
        ).sync(new BlobLeaseSyncer(blobModel));
      };

      // fill the page by possibly querying multiple times
      const page = new PageWithDelimiter<BlobsModel>(
        maxResults,
        delimiter,
        prefix
      );

      const nameItem = (item: BlobsModel): string => {
        return this.getModelValue<string>(item, "blobName", true);
      };

      const readPage = async (off: number): Promise<BlobsModel[]> => {
        return await BlobsModel.findAll({
          where: whereQuery as any,
          order: [["blobName", "ASC"]],
          transaction: t,
          limit: maxResults,
          offset: off
        });
      };

      const [blobItems, blobPrefixes, nextMarker] = await page.fill(
        readPage,
        nameItem
      );

      const blobModels = blobItems.map(leaseUpdateMapper);
      return [blobModels, blobPrefixes, nextMarker];
    });
  }

  public async appendData(
    context: Context,
    block: BlockModel,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<void> {
    await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(
        context,
        block.accountName,
        block.containerName,
        t
      );

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: block.accountName,
          containerName: block.containerName,
          blobName: block.blobName,
          snapshot: ""
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult)
        : undefined;
      if (blobModel !== undefined) {
        if (blobModel.isCommitted === true) {
          LeaseFactory.createLeaseState(
            new BlobLeaseAdapter(blobModel),
            context
          ).validate(new BlobWriteLeaseValidator(leaseAccessConditions));
        }
      } else {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      await BlocksModel.upsert(
        {
          accountName: block.accountName,
          containerName: block.containerName,
          blobName: block.blobName,
          blockName: block.name,
          size: block.size,
          persistency: this.serializeModelValue(block.persistency)
        },
        { transaction: t }
      );
    });
  }

  public async flush(
    context: Context,
    blob: BlobModel,
    blockList: { blockName: string }[],
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<void> {
    await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(
        context,
        blob.accountName,
        blob.containerName,
        t
      );

      const pUncommittedBlocksMap: Map<string, PersistencyBlockModel> =
        new Map(); // persistencyUncommittedBlocksMap

      const badRequestError = StorageErrorFactory.getInvalidBlockList(context);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: blob.accountName,
          containerName: blob.containerName,
          blobName: blob.name,
          snapshot: blob.snapshot,
          isCommitted: true
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult)
        : undefined;
      validateWriteConditions(context, modifiedAccessConditions, blobModel);

      let creationTime = blob.properties.creationTime || context.startTime;

      if (blobModel !== undefined) {
        // Create if not exists
        if (
          modifiedAccessConditions &&
          modifiedAccessConditions.ifNoneMatch === "*" &&
          blobModel &&
          blobModel.isCommitted
        ) {
          throw StorageErrorFactory.getBlobAlreadyExists(context);
        }

        creationTime = blobModel.properties.creationTime || creationTime;

        LeaseFactory.createLeaseState(
          new BlobLeaseAdapter(blobModel),
          context
        ).validate(new BlobWriteLeaseValidator(leaseAccessConditions));
      }

      const blockFindResult = await BlocksModel.findAll({
        where: {
          accountName: blob.accountName,
          containerName: blob.containerName,
          blobName: blob.name
        },
        transaction: t
      });
      for (const item of blockFindResult) {
        const block: PersistencyBlockModel = {
          name: this.getModelValue<string>(item, "blockName", true),
          size: this.getModelValue<number>(item, "size", true),
          persistency: this.deserializeModelValue(item, "persistency")
        };
        pUncommittedBlocksMap.set(block.name, block);
      }

      const selectedBlockList: PersistencyBlockModel[] =
        blobModel && blobModel.committedBlocksInOrder
          ? blobModel.committedBlocksInOrder
          : [];
      for (const block of blockList) {
        const pUncommittedBlock = pUncommittedBlocksMap.get(block.blockName);
        if (pUncommittedBlock === undefined) {
          throw badRequestError;
        } else {
          selectedBlockList.push(pUncommittedBlock);
        }
      }

      const commitBlockBlob: BlobModel = {
        ...blob,
        deleted: false,
        committedBlocksInOrder: selectedBlockList,
        properties: {
          ...blob.properties,
          creationTime,
          lastModified: blob.properties.lastModified || context.startTime,
          contentLength: selectedBlockList
            .map((block) => block.size)
            .reduce((total, val) => {
              return total + val;
            }, 0)
        }
      };

      new BlobWriteLeaseSyncer(commitBlockBlob).sync(
        new BlobLeaseAdapter(commitBlockBlob)
      );

      await BlobsModel.upsert(this.convertBlobModelToDbModel(commitBlockBlob), {
        transaction: t
      });

      await BlocksModel.destroy({
        where: {
          accountName: blob.accountName,
          containerName: blob.containerName,
          blobName: blob.name
        },
        transaction: t
      });
    });
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
    return await this.sequelize.transaction(async (t) => {
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

      await this.deleteBlob(context, account, sourceContainer, sourceBlob, {});

      return model;
    });
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
    return await this.sequelize.transaction(async (t) => {
      const doc = await this.getBlobWithLeaseUpdated(
        account,
        container,
        blob,
        "",
        context,
        false,
        true,
        t
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
    });
  }
}
