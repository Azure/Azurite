import async from "async";
import { promisify } from "bluebird";
import { BOOLEAN, DATE, INTEGER, literal, Model, Op, Options as SequelizeOptions, Sequelize, TEXT } from "sequelize";

import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import IBlobMetadataStore, {
  BlobModel,
  BlockModel,
  ContainerModel,
  PersistencyBlockModel,
  ServicePropertiesModel,
} from "./IBlobMetadataStore";

// tslint:disable: max-classes-per-file
class ServicesModel extends Model {}
class ContainersModel extends Model {}
class BlobsModel extends Model {}
class TestModel extends Model {}
class BlocksModel extends Model {}
// class PagesModel extends Model {}

/*
 * Preparations before starting with Sql based metadata store implementation
 * 1. Setup a database, like MySql, MariaDB, Sql Server or SqlLite
 * 2. (For development) Update database connection configurations under migrations/blob/metadata/config/config.json;
 *    (For production) Update environment variables `AZURITE_DB_USERNAME`, `AZURITE_DB_PASSWORD`, `AZURITE_DB_NAME`,
 *    `AZURITE_DB_HOSTNAME`, `AZURITE_DB_DIALECT`
 * 3. Create a database by `npm run db:create:blob:metadata` or create it manually
 * 4. Migrate database by `npm run db:migrate:blob:metadata`
 *
 * Steps to setup database in docker:
 * - docker run --name mariadb -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mariadb:latest
 *
 * - docker run --name mysql1 -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mysql:latest
 * - docker exec -it mysql1 /bin/bash
 *
 */

/**
 * A SQL based Blob metadata storage implementation based on Sequelize.
 *
 * @export
 * @class SqlBlobMetadataStore
 * @implements {IBlobMetadataStore}
 */
export default class SqlBlobMetadataStore implements IBlobMetadataStore {
  private initialized: boolean = false;
  private closed: boolean = false;
  private readonly sequelize: Sequelize;

  /**
   * Creates an instance of SqlBlobMetadataStore.
   *
   * @param {string} connectionURI For example, "postgres://user:pass@example.com:5432/dbname"
   * @param {SequelizeOptions} [sequelizeOptions]
   * @memberof SqlBlobMetadataStore
   */
  public constructor(
    connectionURI: string,
    sequelizeOptions?: SequelizeOptions
  ) {
    this.sequelize = new Sequelize(connectionURI, sequelizeOptions);
  }

  public async init(): Promise<void> {
    await this.sequelize.authenticate();

    // TODO: Duplicate models definition here with migrations files; Should update them together to avoid inconsistency
    ServicesModel.init(
      {
        // TODO: Check max account name length
        accountName: {
          type: "VARCHAR(255)",
          primaryKey: true
        },
        defaultServiceVersion: {
          type: "VARCHAR(31)"
        },
        cors: {
          type: "VARCHAR(255)"
        },
        logging: {
          type: "VARCHAR(255)"
        },
        minuteMetrics: {
          type: "VARCHAR(255)"
        },
        hourMetrics: {
          type: "VARCHAR(255)"
        },
        staticWebsite: {
          type: "VARCHAR(255)"
        },
        deleteRetentionPolicy: {
          type: "VARCHAR(255)"
        }
      },
      {
        sequelize: this.sequelize,
        modelName: "Services",
        tableName: "Services",
        timestamps: false
      }
    );

    // TODO: Duplicate models definition here with migrations files; Should update them together to avoid inconsistency
    ContainersModel.init(
      {
        accountName: {
          type: "VARCHAR(255)",
          unique: "accountname_containername"
        },
        // TODO: Check max container name length
        containerName: {
          type: "VARCHAR(255)",
          unique: "accountname_containername"
        },
        containerId: {
          type: INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true
        },
        lastModified: {
          allowNull: false,
          type: DATE(6)
        },
        etag: {
          allowNull: false,
          type: "VARCHAR(127)"
        },
        metadata: {
          type: "VARCHAR(2047)"
        },
        containerAcl: {
          type: "VARCHAR(1023)"
        },
        publicAccess: {
          type: "VARCHAR(31)"
        },
        hasImmutabilityPolicy: {
          type: BOOLEAN
        },
        hasLegalHold: {
          type: BOOLEAN
        },
        deleting: {
          type: INTEGER.UNSIGNED,
          defaultValue: 0, // 0 means container is not under deleting(gc)
          allowNull: false
        }
      },
      {
        sequelize: this.sequelize,
        modelName: "Containers",
        tableName: "Containers",
        timestamps: false
      }
    );

    // TODO: Duplicate models definition here with migrations files; Should update them together to avoid inconsistency
    BlobsModel.init(
      {
        accountName: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        containerName: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        // TODO: Check max blob name length
        blobName: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        snapshot: {
          type: "VARCHAR(255)",
          allowNull: false,
          defaultValue: ""
        },
        blobId: {
          type: INTEGER.UNSIGNED,
          primaryKey: true,
          autoIncrement: true
        },
        lastModified: {
          allowNull: false,
          type: DATE(6)
        },
        etag: {
          allowNull: false,
          type: "VARCHAR(127)"
        },
        deleting: {
          type: INTEGER.UNSIGNED,
          defaultValue: 0, // 0 means container is not under deleting(gc)
          allowNull: false
        },
        isCommitted: {
          type: BOOLEAN,
          allowNull: false
        },
        persistency: {
          type: "VARCHAR(255)"
        },
        committedBlocksInOrder: {
          type: TEXT({ length: "medium" })
        },
        metadata: {
          type: "VARCHAR(2047)"
        }
      },
      {
        sequelize: this.sequelize,
        modelName: "Blobs",
        tableName: "Blobs",
        timestamps: false,
        indexes: [
          {
            // name: 'title_index',
            // using: 'BTREE',
            fields: [
              "accountName",
              "containerName",
              "blobName",
              "snapshot",
              "deleting"
            ]
          }
        ]
      }
    );

    BlocksModel.init(
      {
        accountName: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        containerName: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        blobName: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        // TODO: Check max block name length
        blockName: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        deleting: {
          type: INTEGER.UNSIGNED,
          defaultValue: 0, // 0 means container is not under deleting(gc)
          allowNull: false
        },
        size: {
          type: INTEGER.UNSIGNED,
          allowNull: false
        },
        persistency: {
          type: "VARCHAR(255)"
        }
      },
      {
        sequelize: this.sequelize,
        modelName: "Blocks",
        tableName: "Blocks",
        timestamps: false,
        indexes: [
          {
            fields: ["accountName", "containerName", "blobName", "blockName"]
          }
        ]
      }
    );

    TestModel.init(
      {
        blobName: {
          type: "VARCHAR(50)",
          primaryKey: true
        },
        blockList: {
          type: "MEDIUMTEXT"
        },
        createdAt: {
          allowNull: false,
          type: DATE
        },
        updatedAt: {
          allowNull: false,
          type: DATE
        }
      },
      { sequelize: this.sequelize, modelName: "Test", tableName: "Tests" }
    );

    // TODO: sync() is only for development purpose, use migration for production
    await this.sequelize.sync();

    this.initialized = true;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public async close(): Promise<void> {
    await this.sequelize.close();
    this.closed = true;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public async setServiceProperties<T extends ServicePropertiesModel>(
    serviceProperties: T
  ): Promise<T> {
    // TODO: Optimize to reduce first query IO, or caching
    return this.sequelize
      .transaction(t => {
        return ServicesModel.findByPk(serviceProperties.accountName, {
          transaction: t
        }).then(res => {
          const updateValues = {
            defaultServiceVersion: serviceProperties.defaultServiceVersion,
            cors: this.serializeModelValue(serviceProperties.cors),
            logging: this.serializeModelValue(serviceProperties.logging),
            minuteMetrics: this.serializeModelValue(
              serviceProperties.minuteMetrics
            ),
            hourMetrics: this.serializeModelValue(
              serviceProperties.hourMetrics
            ),
            staticWebsite: this.serializeModelValue(
              serviceProperties.staticWebsite
            ),
            deleteRetentionPolicy: this.serializeModelValue(
              serviceProperties.deleteRetentionPolicy
            )
          };

          if (res === null) {
            return ServicesModel.create(
              {
                accountName: serviceProperties.accountName,
                ...updateValues
              },
              { transaction: t }
            );
          } else {
            return ServicesModel.update(updateValues, {
              transaction: t,
              where: {
                accountName: serviceProperties.accountName
              }
            }).then(updateResult => {
              const updateNumber = updateResult[0];
              if (updateNumber !== 1) {
                throw Error(
                  `SqlBlobMetadataStore:updateServiceProperties() failed. Update operation affect ${updateNumber} rows.`
                );
              }
              return undefined;
            });
          }
        });
      })
      .then(() => {
        return serviceProperties;
      });
  }

  public async getServiceProperties(
    account: string
  ): Promise<ServicePropertiesModel | undefined> {
    return ServicesModel.findByPk(account).then(res => {
      if (res === null) {
        return undefined;
      }

      const logging = this.deserializeModelValue(res, "logging");
      const hourMetrics = this.deserializeModelValue(res, "hourMetrics");
      const minuteMetrics = this.deserializeModelValue(res, "minuteMetrics");
      const cors = this.deserializeModelValue(res, "cors");
      const deleteRetentionPolicy = this.deserializeModelValue(
        res,
        "deleteRetentionPolicy"
      );
      const staticWebsite = this.deserializeModelValue(res, "staticWebsite");
      const defaultServiceVersion = this.getModelValue<string>(
        res,
        "defaultServiceVersion"
      );

      const ret: ServicePropertiesModel = {
        accountName: account
      };

      if (logging !== undefined) {
        ret.logging = logging;
      }
      if (hourMetrics !== undefined) {
        ret.hourMetrics = hourMetrics;
      }
      if (minuteMetrics !== undefined) {
        ret.minuteMetrics = minuteMetrics;
      }
      if (cors !== undefined) {
        ret.cors = cors;
      }
      if (deleteRetentionPolicy !== undefined) {
        ret.deleteRetentionPolicy = deleteRetentionPolicy;
      }
      if (staticWebsite !== undefined) {
        ret.staticWebsite = staticWebsite;
      }
      if (defaultServiceVersion !== undefined) {
        ret.defaultServiceVersion = defaultServiceVersion;
      }

      return ret;
    });
  }

  public async getContainerProperties(
    account: string,
    container: string
  ): Promise<ContainerModel | undefined> {
    return ContainersModel.findOne({
      where: {
        accountName: account,
        containerName: container
      }
    }).then(res => {
      if (res === null || res === undefined) {
        return undefined;
      }

      const lastModified = this.getModelValue<Date>(res, "lastModified");
      if (lastModified === undefined) {
        throw Error(
          `SqlBlobMetadataStore:getContainer() Error. lastModified is undefined.`
        );
      }

      const etag = this.getModelValue<string>(res, "etag");
      if (etag === undefined) {
        throw Error(
          `SqlBlobMetadataStore:getContainer() Error. etag is undefined.`
        );
      }

      const metadata = this.deserializeModelValue(res, "metadata");
      const containerAcl = this.deserializeModelValue(res, "containerAcl");
      const publicAccess = this.deserializeModelValue(res, "publicAccess");
      const hasImmutabilityPolicy = this.getModelValue<boolean>(
        res,
        "hasImmutabilityPolicy"
      );
      const hasLegalHold = this.getModelValue<boolean>(res, "hasLegalHold");

      const ret: ContainerModel = {
        accountName: account,
        name: container,
        properties: {
          lastModified,
          etag
        }
      };

      if (metadata !== undefined) {
        ret.metadata = metadata;
      }

      if (containerAcl !== undefined) {
        ret.containerAcl = containerAcl;
      }

      if (publicAccess !== undefined) {
        ret.properties.publicAccess = publicAccess;
      }

      if (hasImmutabilityPolicy !== undefined) {
        ret.properties.hasImmutabilityPolicy = hasImmutabilityPolicy;
      }

      if (hasLegalHold !== undefined) {
        ret.properties.hasLegalHold = hasLegalHold;
      }

      return ret;
    });
  }

  public async deleteContainer(
    account: string,
    container: string
  ): Promise<void> {
    return ContainersModel.destroy({
      where: {
        accountName: account,
        containerName: container
      }
    }).then(res => {
      // TODO: Delete all blob, blocks record for that account within transaction
      // TODO: Can we make above delete async in GC?
      return;
    });
  }

  /**
   * TODO: Update parameter model to accept metadata only
   *
   * @template T
   * @param {T} container
   * @returns {Promise<T>}
   * @memberof SqlBlobMetadataStore
   */
  public async setContainerMetadata<T extends ContainerModel>(
    container: T
  ): Promise<T> {
    return ContainersModel.update(
      {
        lastModified: container.properties.lastModified,
        etag: container.properties.etag,
        // When metadata is undefined, pass null to force clean db column value
        metadata: this.serializeModelValue(container.metadata) || null
        // containerAcl: this.serializeModelValue(container.containerAcl) || null,
        // publicAccess:
        //   this.serializeModelValue(container.properties.publicAccess) || null,
        // hasImmutabilityPolicy:
        //   container.properties.hasImmutabilityPolicy || null,
        // hasLegalHold: container.properties.hasLegalHold || null
      },
      {
        where: {
          accountName: container.accountName,
          containerName: container.name
        }
      }
    ).then(() => container);
  }

  public async createContainer(
    container: ContainerModel
  ): Promise<ContainerModel> {
    try {
      return await ContainersModel.create({
        accountName: container.accountName,
        containerName: container.name,
        lastModified: container.properties.lastModified,
        etag: container.properties.etag,
        metadata: this.serializeModelValue(container.metadata),
        containerAcl: this.serializeModelValue(container.containerAcl),
        publicAccess: this.serializeModelValue(
          container.properties.publicAccess
        ),
        hasImmutabilityPolicy: container.properties.hasImmutabilityPolicy,
        hasLegalHold: container.properties.hasLegalHold
      }).then(() => container);
    } catch (err) {
      if (err.name === "SequelizeUniqueConstraintError") {
        // TODO: filling request id
        throw StorageErrorFactory.getContainerAlreadyExists("");
      }
      throw err;
    }
  }

  public async listContainers(
    account: string,
    prefix: string = "",
    maxResults: number = 2000,
    marker?: number | undefined
  ): Promise<[ContainerModel[], number | undefined]> {
    const whereQuery: any = { accountName: account };
    if (prefix.length > 0) {
      whereQuery.containerName = {
        [Op.like]: `${prefix}%`
      };
    }
    if (marker !== undefined) {
      whereQuery.containerId = {
        [Op.gt]: marker
      };
    }

    const modelConvert = (dbModel: ContainersModel): ContainerModel => {
      const model: ContainerModel = {
        accountName: this.getModelValue<string>(dbModel, "accountName", true),
        name: this.getModelValue<string>(dbModel, "containerName", true),
        containerAcl: this.deserializeModelValue(dbModel, "containerAcl"),
        metadata: this.deserializeModelValue(dbModel, "metadata"),
        properties: {
          lastModified: this.getModelValue<Date>(dbModel, "lastModified", true),
          etag: this.getModelValue<string>(dbModel, "etag", true),
          publicAccess: this.deserializeModelValue(dbModel, "publicAccess"),
          hasImmutabilityPolicy: this.getModelValue<boolean>(
            dbModel,
            "hasImmutabilityPolicy"
          ),
          hasLegalHold: this.getModelValue<boolean>(dbModel, "hasLegalHold")
        }
      };
      return model;
    };

    return ContainersModel.findAll({
      limit: maxResults,
      where: whereQuery as any,
      order: [["containerId", "ASC"]]
    }).then(res => {
      if (res.length < maxResults) {
        return [res.map(val => modelConvert(val)), undefined];
      } else {
        const tail = res[res.length - 1];
        const nextMarker = this.getModelValue<number>(
          tail,
          "containerId",
          true
        );
        return [res.map(val => modelConvert(val)), nextMarker];
      }
    });
  }

  public deleteBlobs(account: string, container: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public async createBlob(blob: BlobModel): Promise<void> {
    // TODO: Check account & container status
    await BlobsModel.upsert({
      accountName: blob.accountName,
      containerName: blob.containerName,
      blobName: blob.name,
      snapshot: blob.snapshot,
      isCommitted: true,
      lastModified: blob.properties.lastModified,
      etag: blob.properties.etag,
      persistency: this.serializeModelValue(blob.persistency),
      committedBlocksInOrder: this.serializeModelValue(
        blob.committedBlocksInOrder
      )
    });
  }

  public downloadBlob(
    account: string,
    container: string,
    blob: string,
    snapshot: string = ""
  ): Promise<BlobModel | undefined> {
    // TODO: Check account & container status
    return BlobsModel.findOne({
      where: {
        accountName: account,
        containerName: container,
        blobName: blob,
        snapshot
      }
    }).then(res => {
      if (res === null || res === undefined) {
        return undefined;
      }

      const isCommitted = this.getModelValue<boolean>(res, "isCommitted", true);
      if (!isCommitted) {
        return undefined;
      }

      return {
        accountName: account,
        containerName: container,
        name: blob,
        snapshot,
        isCommitted,
        properties: {
          lastModified: this.getModelValue<Date>(res, "lastModified", true),
          etag: this.getModelValue<string>(res, "etag", true)
        },
        persistency: this.deserializeModelValue(res, "persistency"),
        committedBlocksInOrder: this.deserializeModelValue(
          res,
          "committedBlocksInOrder"
        )
      };
    });
  }

  public listBlobs(
    account?: string | undefined,
    container?: string | undefined,
    blob?: string | undefined,
    prefix: string | undefined = "",
    maxResults: number | undefined = 2000,
    marker?: number | undefined,
    includeSnapshots: boolean = false
  ): Promise<[BlobModel[], number | undefined]> {
    // TODO: Validate account, container
    const whereQuery: any = { accountName: account, containerName: container };
    if (prefix.length > 0) {
      whereQuery.blobName = {
        [Op.like]: `${prefix}%`
      };
    }
    if (marker !== undefined) {
      whereQuery.blobId = {
        [Op.gt]: marker
      };
    }
    // TODO: Query snapshot

    const modelConvert = (res: BlobsModel): BlobModel => {
      return {
        accountName: this.getModelValue<string>(res, "accountName", true),
        containerName: this.getModelValue<string>(res, "containerName", true),
        name: this.getModelValue<string>(res, "blobName", true),
        snapshot: this.getModelValue<string>(res, "snapshot", true),
        isCommitted: this.getModelValue<boolean>(res, "isCommitted", true),
        properties: {
          lastModified: this.getModelValue<Date>(res, "lastModified", true),
          etag: this.getModelValue<string>(res, "etag", true)
        },
        persistency: this.deserializeModelValue(res, "persistency"),
        committedBlocksInOrder: this.deserializeModelValue(
          res,
          "committedBlocksInOrder"
        )
      };
    };

    return BlobsModel.findAll({
      limit: maxResults,
      where: whereQuery as any,
      // TODO: Should use ASC order index?
      order: [["blobId", "ASC"]]
    }).then(res => {
      if (res.length < maxResults) {
        return [res.map(val => modelConvert(val)), undefined];
      } else {
        const tail = res[res.length - 1];
        const nextMarker = this.getModelValue<number>(tail, "blobId", true);
        return [res.map(val => modelConvert(val)), nextMarker];
      }
    });
  }
  public deleteBlob(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public async stageBlock(block: BlockModel): Promise<void> {
    await BlocksModel.upsert({
      accountName: block.accountName,
      containerName: block.containerName,
      blobName: block.blobName,
      blockName: block.name,
      size: block.size,
      persistency: this.serializeModelValue(block.persistency)
    });
  }

  public async getBlockList(
    account: string,
    container: string,
    blob: string,
    isCommitted?: boolean | undefined
  ): Promise<{
    uncommittedBlocks: Models.Block[];
    committedBlocks: Models.Block[];
  }> {
    const res: {
      uncommittedBlocks: Models.Block[];
      committedBlocks: Models.Block[];
    } = {
      uncommittedBlocks: [],
      committedBlocks: []
    };

    await this.sequelize.transaction(async t => {
      if (isCommitted !== false) {
        const blobModel = await BlobsModel.findOne({
          attributes: ["committedBlocksInOrder"],
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: ""
          },
          transaction: t
        });

        if (blobModel !== null && res !== undefined) {
          res.committedBlocks = this.deserializeModelValue(
            blobModel,
            "committedBlocksInOrder"
          );
        }
      }

      if (isCommitted !== true) {
        const blocks = await BlocksModel.findAll({
          attributes: ["blockName", "size"],
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            deleting: 0
          },
          transaction: t
        });
        for (const item of blocks) {
          const block = {
            name: this.getModelValue<string>(item, "blockName", true),
            size: this.getModelValue<number>(item, "size", true)
          };
          res.uncommittedBlocks.push(block);
        }
      }
    });

    return res;
  }

  public async commitBlockList(
    blob: BlobModel,
    blockList: { blockName: string; blockCommitType: string }[]
  ): Promise<void> {
    // TODO: Validate account, container
    // Steps:
    // 1. Check blob exist
    // 2. Get committed block list
    // 3. Get uncommitted block list
    // 4. Check incoming block list
    // 5. Update blob model
    // 6. GC uncommitted blocks

    await this.sequelize.transaction(async t => {
      const pCommittedBlocksMap: Map<string, PersistencyBlockModel> = new Map(); // persistencyCommittedBlocksMap
      const pUncommittedBlocksMap: Map<
        string,
        PersistencyBlockModel
      > = new Map(); // persistencyUncommittedBlocksMap

      // TODO: Fill in context id
      const badRequestError = StorageErrorFactory.getInvalidOperation("");

      const res = await BlobsModel.findOne({
        where: {
          accountName: blob.accountName,
          containerName: blob.containerName,
          blobName: blob.name,
          snapshot: blob.snapshot
        },
        transaction: t
      });
      if (res !== null && res !== undefined) {
        const committedBlocksInOrder = this.deserializeModelValue(
          res!,
          "committedBlocksInOrder"
        );
        for (const pBlock of committedBlocksInOrder || []) {
          pCommittedBlocksMap.set(pBlock.name, pBlock);
        }
      }
      const res_1 = await BlocksModel.findAll({
        where: {
          accountName: blob.accountName,
          containerName: blob.containerName,
          blobName: blob.name,
          deleting: 0
        },
        transaction: t
      });
      for (const item of res_1) {
        const block = {
          name: this.getModelValue<string>(item, "blockName", true),
          size: this.getModelValue<number>(item, "size", true),
          persistency: this.deserializeModelValue(item, "persistency")
        };
        pUncommittedBlocksMap.set(block.name, block);
      }
      const selectedBlockList: PersistencyBlockModel[] = [];
      for (const block_1 of blockList) {
        switch (block_1.blockCommitType.toLowerCase()) {
          case "uncommitted":
            const pUncommittedBlock = pUncommittedBlocksMap.get(
              block_1.blockName
            );
            if (pUncommittedBlock === undefined) {
              throw badRequestError;
            } else {
              selectedBlockList.push(pUncommittedBlock);
            }
            break;
          case "committed":
            const pCommittedBlock = pCommittedBlocksMap.get(block_1.blockName);
            if (pCommittedBlock === undefined) {
              throw badRequestError;
            } else {
              selectedBlockList.push(pCommittedBlock);
            }
            break;
          case "latest":
            const pLatestBlock =
              pUncommittedBlocksMap.get(block_1.blockName) ||
              pCommittedBlocksMap.get(block_1.blockName);
            if (pLatestBlock === undefined) {
              throw badRequestError;
            } else {
              selectedBlockList.push(pLatestBlock);
            }
            break;
          default:
            throw badRequestError;
        }
      }

      await BlobsModel.upsert(
        {
          accountName: blob.accountName,
          containerName: blob.containerName,
          blobName: blob.name,
          snapshot: "",
          isCommitted: true,
          lastModified: blob.properties.lastModified,
          etag: blob.properties.etag,
          persistency: null,
          committedBlocksInOrder: this.serializeModelValue(selectedBlockList)
        },
        { transaction: t }
      );

      await BlocksModel.update(
        {
          deleting: literal("deleting + 1")
        },
        {
          where: {
            accountName: blob.accountName,
            containerName: blob.containerName,
            blobName: blob.name
          },
          transaction: t
        }
      );
    });
  }

  public async insertBlock(block: BlockModel): Promise<void> {
    await TestModel.create({
      blobName: block.blobName,
      blockList: block.name
    });
  }

  public async updateBlock(block: BlockModel): Promise<void> {
    await TestModel.update(
      {
        blockList: block.name
      },
      {
        where: { blobName: block.blobName }
      }
    );
  }

  public async updateBlocksTran(blocks: BlockModel[]): Promise<void> {
    const mapLimitAsync = promisify(async.mapLimit);

    await this.sequelize.transaction(t => {
      return mapLimitAsync(blocks, 100, async block => {
        return TestModel.update(
          { blockList: block.name },
          { transaction: t, where: { blobName: block.blobName } }
        );
      });
    });
  }

  public async bulkInsertBlock(blocks: BlockModel[]): Promise<void> {
    await TestModel.bulkCreate(
      blocks.map(block => {
        return { blobName: block.blobName, blockList: block.name };
      })
    );
  }

  public async bulkInsertBlockTran(blocks: BlockModel[]): Promise<void> {
    const mapLimitAsync = promisify(async.mapLimit);

    await this.sequelize.transaction(t => {
      return mapLimitAsync(blocks, 100, async block => {
        return TestModel.create(
          { blobName: block.blobName, blockList: block.name },
          { transaction: t }
        );
      });
    });
  }

  public deleteAllBlocks(
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public insertBlocks<T extends BlockModel>(blocks: T[]): Promise<T[]> {
    throw new Error("Method not implemented.");
  }

  public getBlock<T extends BlockModel>(
    account: string,
    container: string,
    blob: string,
    block: string,
    isCommitted: boolean
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }

  public setBlobHTTPHeaders(blob: BlobModel): Promise<BlobModel> {
    throw new Error("Method not implemented.");
  }

  public setBlobMetadata(blob: BlobModel): Promise<BlobModel> {
    throw new Error("Method not implemented.");
  }

  public getBlobProperties(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<BlobModel | undefined> {
    throw new Error("Method not implemented.");
  }

  public undeleteBlob(
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  private getModelValue<T>(model: Model, key: string): T | undefined;
  private getModelValue<T>(model: Model, key: string, isRequired: true): T;
  private getModelValue<T>(
    model: Model,
    key: string,
    isRequired?: boolean
  ): T | undefined {
    const value = model.get(key) as T | undefined;
    if (value === undefined && isRequired === true) {
      // tslint:disable-next-line:max-line-length
      throw new Error(
        `SqlBlobMetadataStore:getModelValue() error. ${key} is required but value from database model is undefined.`
      );
    }
    return value;
  }

  private deserializeModelValue(
    model: Model,
    key: string,
    isRequired: boolean = false
  ): any {
    const rawValue = this.getModelValue<string>(model, key);
    if (typeof rawValue === "string") {
      // TODO: Decouple deserializer
      return JSON.parse(rawValue);
    }

    if (isRequired) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `SqlBlobMetadataStore:deserializeModelValue() error. ${key} is required but value from database model is undefined.`
      );
    }

    return undefined;
  }

  private serializeModelValue(value: any): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return JSON.stringify(value);
  }
}
