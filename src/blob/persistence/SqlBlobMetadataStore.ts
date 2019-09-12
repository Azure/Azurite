import async from "async";
import { promisify } from "bluebird";
import {
  BOOLEAN,
  DATE,
  INTEGER,
  literal,
  Model,
  Op,
  Options as SequelizeOptions,
  Sequelize,
  TEXT
} from "sequelize";
import uuid from "uuid/v4";

import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IBlobMetadataStore, {
  AcquireBlobLeaseRes,
  AcquireContainerLeaseRes,
  BlobId,
  BlobModel,
  BlockModel,
  BreakBlobLeaseRes,
  BreakContainerLeaseRes,
  ChangeBlobLeaseRes,
  ChangeContainerLeaseRes,
  ContainerModel,
  CreateSnapshotRes,
  GetBlobPropertiesRes,
  GetContainerAccessPolicyRes,
  GetContainerPropertiesRes,
  GetPageRangeRes,
  IContainerMetadata,
  PersistencyBlockModel,
  ReleaseBlobLeaseRes,
  RenewBlobLeaseRes,
  RenewContainerLeaseRes,
  ServicePropertiesModel,
  SetContainerAccessPolicyParam
} from "./IBlobMetadataStore";

// tslint:disable: max-classes-per-file
class ServicesModel extends Model {}
class ContainersModel extends Model {}
class BlobsModel extends Model {}
class TestModel extends Model {}
class BlocksModel extends Model {}
// class PagesModel extends Model {}

interface IContainerLease {
  leaseStatus?: Models.LeaseStatusType;
  leaseState?: Models.LeaseStateType;
  leaseDuration?: Models.LeaseDurationType;
  leasedurationNumber?: number;
  leaseId?: string;
  leaseExpireTime?: Date;
  leaseBreakExpireTime?: Date;
}

interface IBlobLease {
  leaseStatus?: Models.LeaseStatusType;
  leaseState?: Models.LeaseStateType;
  leaseDuration?: Models.LeaseDurationType;
  leasedurationNumber?: number;
  leaseId?: string;
  leaseExpireTime?: Date;
  leaseBreakExpireTime?: Date;
}

interface IBlobContentProperties {
  contentLength?: number;
  contentType?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  contentMD5?: Uint8Array;
  contentDisposition?: string;
  cacheControl?: string;
}

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
          type: "VARCHAR(1023)"
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
        leaseId: {
          type: "VARCHAR(127)"
        },
        leaseStatus: {
          type: "VARCHAR(31)"
        },
        leaseState: {
          type: "VARCHAR(31)"
        },
        leaseDuration: {
          type: "VARCHAR(31)"
        },
        leasedurationNumber: {
          type: "VARCHAR(63)"
        },
        leaseExpireTime: {
          type: DATE(6)
        },
        leaseBreakExpireTime: {
          type: DATE(6)
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
        blobType: {
          allowNull: false,
          type: "VARCHAR(31)"
        },
        blobSequenceNumber: {
          type: "VARCHAR(63)"
        },
        accessTier: {
          type: "VARCHAR(31)"
        },
        contentProperties: {
          type: "VARCHAR(1023)"
        },
        leaseId: {
          type: "VARCHAR(127)"
        },
        leaseStatus: {
          type: "VARCHAR(31)"
        },
        leaseState: {
          type: "VARCHAR(31)"
        },
        leaseDuration: {
          type: "VARCHAR(31)"
        },
        leasedurationNumber: {
          type: "VARCHAR(63)"
        },
        leaseExpireTime: {
          type: DATE(6)
        },
        leaseBreakExpireTime: {
          type: DATE(6)
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

  public async setServiceProperties(
    serviceProperties: ServicePropertiesModel
  ): Promise<ServicePropertiesModel> {
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
              // TODO: set the exactly equal properties will affect 0 rows.
              const updateNumber = updateResult[0];
              if (updateNumber > 1) {
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
    container: string,
    context?: Context
  ): Promise<GetContainerPropertiesRes> {
    return ContainersModel.findOne({
      where: {
        accountName: account,
        containerName: container
      }
    }).then(res => {
      if (res === null || res === undefined) {
        const requestId = context ? context.contextID : undefined;
        throw StorageErrorFactory.getContainerNotFound(requestId);
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

      const requestId = context ? context.contextID : undefined;
      if (res === null || res === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const leaseId = this.getModelValue<string>(res, "leaseId");
      const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
        res,
        "leaseStatus"
      );
      const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
        res,
        "leaseDuration"
      );
      const leaseState = this.getModelValue<Models.LeaseStateType>(
        res,
        "leaseState"
      );
      const leasedurationNumber = this.getModelValue<number>(
        res,
        "leasedurationNumber"
      );
      const leaseExpireTime = this.getModelValue<Date>(res, "leaseExpireTime");
      const leaseBreakExpireTime = this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      );

      let lease: IContainerLease = {
        leaseId,
        leaseStatus,
        leaseBreakExpireTime,
        leaseDuration,
        leaseExpireTime,
        leaseState,
        leasedurationNumber
      };

      lease = this.updateContainerLeaseAttributes(
        lease,
        context ? context.startTime! : new Date()
      );

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
          etag,
          leaseStatus: lease.leaseStatus,
          leaseDuration: lease.leaseDuration,
          leaseState: lease.leaseState
        },
        leaseId: lease.leaseId,
        leaseBreakExpireTime: lease.leaseBreakExpireTime,
        leaseExpireTime: lease.leaseExpireTime,
        leaseduration: lease.leasedurationNumber
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

      return {
        name: ret.name,
        properties: ret.properties,
        metadata: ret.metadata
      };
    });
  }

  public async deleteContainer(
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    context?: Context
  ): Promise<void> {
    await this.sequelize.transaction(async t => {
      const res = await ContainersModel.findOne({
        attributes: [
          "leaseId",
          "leaseStatus",
          "leaseDuration",
          "leaseState",
          "leasedurationNumber",
          "leaseExpireTime",
          "leaseBreakExpireTime"
        ],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (res === null || res === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const leaseId = this.getModelValue<string>(res, "leaseId");
      const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
        res,
        "leaseStatus"
      );
      const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
        res,
        "leaseDuration"
      );
      const leaseState = this.getModelValue<Models.LeaseStateType>(
        res,
        "leaseState"
      );
      const leasedurationNumber = this.getModelValue<number>(
        res,
        "leasedurationNumber"
      );
      const leaseExpireTime = this.getModelValue<Date>(res, "leaseExpireTime");
      const leaseBreakExpireTime = this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      );

      let lease: IContainerLease = {
        leaseId,
        leaseStatus,
        leaseBreakExpireTime,
        leaseDuration,
        leaseExpireTime,
        leaseState,
        leasedurationNumber
      };

      lease = this.updateContainerLeaseAttributes(
        lease,
        context ? context.startTime! : new Date()
      );

      // Check Lease status
      if (lease.leaseStatus === Models.LeaseStatusType.Locked) {
        if (
          leaseAccessConditions === undefined ||
          leaseAccessConditions.leaseId === undefined ||
          leaseAccessConditions.leaseId === null
        ) {
          throw StorageErrorFactory.getContainerLeaseIdMissing(requestId);
        } else if (
          lease.leaseId !== undefined &&
          leaseAccessConditions.leaseId.toLowerCase() !==
            lease.leaseId.toLowerCase()
        ) {
          throw StorageErrorFactory.getContainerLeaseIdMismatchWithContainerOperation(
            requestId
          );
        }
      } else if (
        leaseAccessConditions !== undefined &&
        leaseAccessConditions.leaseId !== undefined &&
        leaseAccessConditions.leaseId !== null &&
        leaseAccessConditions.leaseId !== ""
      ) {
        throw StorageErrorFactory.getBlobLeaseLost(requestId);
      }

      await ContainersModel.destroy({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      await BlobsModel.update(
        {
          deleting: literal("deleting + 1")
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      await BlocksModel.update(
        {
          deleting: literal("deleting + 1")
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );
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
  public async setContainerMetadata(
    account: string,
    container: string,
    lastModified: Date,
    etag: string,
    metadata?: IContainerMetadata,
    context?: Context
  ): Promise<void> {
    return ContainersModel.update(
      {
        lastModified,
        etag,
        metadata: this.serializeModelValue(metadata) || null
      },
      {
        where: {
          accountName: account,
          containerName: container
        }
      }
    ).then(updateResult => {
      const updateNumber = updateResult[0];
      if (updateNumber === 0) {
        const requestId = context ? context.contextID : undefined;
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }
      return undefined;
    });
  }

  public async createContainer(
    container: ContainerModel,
    context?: Context
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
        leaseStatus: container.properties.leaseStatus,
        leaseState: container.properties.leaseState,
        leaseDuration: container.properties.leaseDuration,
        leaseId: container.leaseId,
        leasedurationNumber: container.leaseduration,
        leaseExpireTime: container.leaseExpireTime,
        leaseBreakExpireTime: container.leaseBreakExpireTime,
        hasImmutabilityPolicy: container.properties.hasImmutabilityPolicy,
        hasLegalHold: container.properties.hasLegalHold
      }).then(() => container);
    } catch (err) {
      if (err.name === "SequelizeUniqueConstraintError") {
        const requestId = context ? context.contextID : undefined;
        throw StorageErrorFactory.getContainerAlreadyExists(requestId);
      }
      throw err;
    }
  }

  public async listContainers(
    account: string,
    prefix: string = "",
    maxResults: number = 2000,
    marker: number | undefined
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
          leaseStatus: this.getModelValue(dbModel, "leaseStatus"),
          leaseState: this.getModelValue(dbModel, "leaseState"),
          leaseDuration: this.getModelValue(dbModel, "leaseDuration"),

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
    const contentProperties =
      this.serializeModelValue({
        contentLength: blob.properties.contentLength,
        contentType: blob.properties.contentType,
        contentEncoding: blob.properties.contentEncoding,
        contentLanguage: blob.properties.contentLanguage,
        contentMD5: blob.properties.contentMD5,
        contentDisposition: blob.properties.contentDisposition
      }) || null;
    await BlobsModel.upsert({
      accountName: blob.accountName,
      containerName: blob.containerName,
      blobName: blob.name,
      snapshot: blob.snapshot,
      blobType: blob.properties.blobType,
      blobSequenceNumber: blob.properties.blobSequenceNumber,
      isCommitted: true,
      lastModified: blob.properties.lastModified,
      etag: blob.properties.etag,
      accessTier: blob.properties.accessTier,
      leaseBreakExpireTime: blob.leaseBreakExpireTime,
      leaseExpireTime: blob.leaseExpireTime,
      leaseId: blob.leaseId,
      leasedurationNumber: blob.leaseduration,
      leaseDuration: blob.properties.leaseDuration,
      leaseStatus: blob.properties.leaseStatus,
      leaseState: blob.properties.leaseState,
      persistency: this.serializeModelValue(blob.persistency),
      committedBlocksInOrder: this.serializeModelValue(
        blob.committedBlocksInOrder
      ),
      metadata: this.serializeModelValue(blob.metadata) || null,
      contentProperties
    });
  }

  public async downloadBlob(
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    context: Context
  ): Promise<BlobModel> {
    const requestId = context ? context.contextID : undefined;
    return ContainersModel.findOne({
      where: {
        accountName: account,
        containerName: container
      }
    }).then(containerRes => {
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }
      return BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot,
          deleting: 0
        }
      }).then(res => {
        if (res === null || res === undefined) {
          throw StorageErrorFactory.getBlobNotFound(requestId);
        }

        const isCommitted = this.getModelValue<boolean>(
          res,
          "isCommitted",
          true
        );
        // TODO: If it needs another error message?
        if (!isCommitted) {
          throw StorageErrorFactory.getBlobNotFound(requestId);
        }

        // Process Lease
        const lease = this.getBlobLease(res, context);

        const blobRes: BlobModel = this.blobModelConvert(res);
        blobRes.leaseBreakExpireTime = lease.leaseBreakExpireTime;
        blobRes.leaseExpireTime = lease.leaseExpireTime;
        blobRes.leaseId = lease.leaseId;
        blobRes.leaseduration = lease.leasedurationNumber;
        blobRes.properties.leaseStatus = lease.leaseStatus;
        blobRes.properties.leaseState = lease.leaseState;
        blobRes.properties.leaseDuration = lease.leaseDuration;

        return blobRes;
      });
    });
  }

  public async listBlobs(
    account?: string,
    container?: string,
    blob?: string,
    prefix: string = "",
    maxResults: number = 2000,
    marker?: string,
    includeSnapshots?: boolean
  ): Promise<[BlobModel[], any | undefined]> {
    // TODO: Validate account, container
    const whereQuery: any = { accountName: account, containerName: container };
    if (blob !== undefined) {
      whereQuery.blobName = blob;
    }

    if (prefix.length > 0) {
      whereQuery.blobName = {
        [Op.like]: `${prefix}%`
      };
    }
    if (marker !== undefined) {
      whereQuery.blobName = {
        [Op.gt]: marker
      };
    }
    // TODO: Query snapshot
    if (!includeSnapshots) {
      whereQuery.snapshot = "";
    }

    whereQuery.deleting = 0;

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
        ),
        metadata: this.deserializeModelValue(res, "metadata")
      };
    };

    return BlobsModel.findAll({
      limit: maxResults,
      where: whereQuery as any,
      // TODO: Should use ASC order index?
      order: [["blobName", "ASC"]]
    }).then(res => {
      if (res.length < maxResults) {
        return [res.map(val => modelConvert(val)), undefined];
      } else {
        const tail = res[res.length - 1];
        const nextMarker = this.getModelValue<string>(tail, "blobName", true);
        return [res.map(val => modelConvert(val)), nextMarker];
      }
    });
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
    isCommitted: boolean | undefined,
    context: Context
  ): Promise<any> {
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
            snapshot: "",
            deleting: 0
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
          snapshot: blob.snapshot,
          deleting: 0
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

  public async getBlobProperties(
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    context: Context
  ): Promise<GetBlobPropertiesRes> {
    const requestId = context ? context.contextID : undefined;
    return ContainersModel.findOne({
      where: {
        accountName: account,
        containerName: container
      }
    }).then(containerRes => {
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }
      return BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot,
          deleting: 0
        }
      }).then(res => {
        if (res === null || res === undefined) {
          throw StorageErrorFactory.getBlobNotFound(requestId);
        }

        const lease = this.getBlobLease(res, context);

        const storedSnapshot = this.getModelValue<string>(
          res,
          "snapshot",
          true
        );
        if (storedSnapshot === "") {
          this.checkLeaseOnReadBlob(
            lease.leaseId,
            lease.leaseStatus,
            leaseAccessConditions,
            requestId
          );
        }
        const blobRes: BlobModel = this.blobModelConvert(res);

        blobRes.leaseBreakExpireTime = lease.leaseBreakExpireTime;
        blobRes.leaseExpireTime = lease.leaseExpireTime;
        blobRes.leaseId = lease.leaseId;
        blobRes.leaseduration = lease.leasedurationNumber;
        blobRes.properties.leaseStatus = lease.leaseStatus;
        blobRes.properties.leaseState = lease.leaseState;
        blobRes.properties.leaseDuration = lease.leaseDuration;

        const metadata = this.deserializeModelValue(res, "metadata");

        const ret: GetBlobPropertiesRes = {
          properties: blobRes!.properties,
          metadata
        };

        return ret;
      });
    });
  }

  public undeleteBlob(
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public getContainer(
    account: string,
    container: string,
    context?: Context | undefined
  ): Promise<ContainerModel> {
    throw new Error("Method not implemented.");
  }
  public async getContainerACL(
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions | undefined,
    context?: Context | undefined
  ): Promise<GetContainerAccessPolicyRes> {
    return ContainersModel.findOne({
      where: {
        accountName: account,
        containerName: container
      }
    }).then(res => {
      const requestId = context ? context.contextID : undefined;
      if (res === null || res === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const leaseId = this.getModelValue<string>(res, "leaseId");
      const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
        res,
        "leaseStatus"
      );
      const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
        res,
        "leaseDuration"
      );
      const leaseState = this.getModelValue<Models.LeaseStateType>(
        res,
        "leaseState"
      );
      const leasedurationNumber = this.getModelValue<number>(
        res,
        "leasedurationNumber"
      );
      const leaseExpireTime = this.getModelValue<Date>(res, "leaseExpireTime");
      const leaseBreakExpireTime = this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      );

      let lease: IContainerLease = {
        leaseId,
        leaseStatus,
        leaseBreakExpireTime,
        leaseDuration,
        leaseExpireTime,
        leaseState,
        leasedurationNumber
      };

      lease = this.updateContainerLeaseAttributes(
        lease,
        context ? context.startTime! : new Date()
      );

      this.checkLeaseOnReadContainer(
        lease.leaseId,
        lease.leaseStatus,
        leaseAccessConditions,
        requestId
      );

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

      const containerAcl = this.deserializeModelValue(res, "containerAcl");
      const publicAccess = this.deserializeModelValue(res, "publicAccess");

      const ret: ContainerModel = {
        accountName: account,
        name: container,
        properties: {
          lastModified,
          etag
        }
      };

      if (containerAcl !== undefined) {
        ret.containerAcl = containerAcl;
      }

      if (publicAccess !== undefined) {
        ret.properties.publicAccess = publicAccess;
      }

      return {
        properties: ret.properties,
        containerAcl: ret.containerAcl
      };
    });
  }

  public async setContainerACL(
    account: string,
    container: string,
    setAclModel: SetContainerAccessPolicyParam,
    context?: Context | undefined
  ): Promise<void> {
    await this.sequelize.transaction(async t => {
      const res = await ContainersModel.findOne({
        attributes: [
          "leaseId",
          "leaseStatus",
          "leaseDuration",
          "leaseState",
          "leasedurationNumber",
          "leaseExpireTime",
          "leaseBreakExpireTime"
        ],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (res === null || res === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const leaseId = this.getModelValue<string>(res, "leaseId");
      const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
        res,
        "leaseStatus"
      );
      const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
        res,
        "leaseDuration"
      );
      const leaseState = this.getModelValue<Models.LeaseStateType>(
        res,
        "leaseState"
      );
      const leasedurationNumber = this.getModelValue<number>(
        res,
        "leasedurationNumber"
      );
      const leaseExpireTime = this.getModelValue<Date>(res, "leaseExpireTime");
      const leaseBreakExpireTime = this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      );

      let lease: IContainerLease = {
        leaseId,
        leaseStatus,
        leaseBreakExpireTime,
        leaseDuration,
        leaseExpireTime,
        leaseState,
        leasedurationNumber
      };

      lease = this.updateContainerLeaseAttributes(
        lease,
        context ? context.startTime! : new Date()
      );

      this.checkLeaseOnReadContainer(
        leaseId,
        leaseStatus,
        setAclModel.leaseAccessConditions,
        requestId
      );

      await ContainersModel.update(
        {
          lastModified: setAclModel.lastModified,
          etag: setAclModel.etag,
          containerAcl:
            this.serializeModelValue(setAclModel.containerAcl) || null,
          publicAccess: this.serializeModelValue(setAclModel.publicAccess)
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      ).then(updateResult => {
        const updateNumber = updateResult[0];
        if (updateNumber === 0) {
          const requestId = context ? context.contextID : undefined;
          throw StorageErrorFactory.getContainerNotFound(requestId);
        }
        return undefined;
      });
    });
  }

  public async acquireContainerLease(
    account: string,
    container: string,
    options: Models.ContainerAcquireLeaseOptionalParams,
    context: Context
  ): Promise<AcquireContainerLeaseRes> {
    return this.sequelize.transaction(async t => {
      const res = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (res === null || res === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const leaseId = this.getModelValue<string>(res, "leaseId");
      const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
        res,
        "leaseStatus"
      );
      const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
        res,
        "leaseDuration"
      );
      const leaseState = this.getModelValue<Models.LeaseStateType>(
        res,
        "leaseState"
      );
      const leasedurationNumber = this.getModelValue<number>(
        res,
        "leasedurationNumber"
      );
      const leaseExpireTime = this.getModelValue<Date>(res, "leaseExpireTime");
      const leaseBreakExpireTime = this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      );

      let lease: IContainerLease = {
        leaseId,
        leaseStatus,
        leaseBreakExpireTime,
        leaseDuration,
        leaseExpireTime,
        leaseState,
        leasedurationNumber
      };

      lease = this.updateContainerLeaseAttributes(lease, context.startTime!);

      // check the lease action aligned with current lease state.
      if (lease.leaseState === Models.LeaseStateType.Breaking) {
        throw StorageErrorFactory.getLeaseAlreadyPresent(requestId);
      }
      if (
        lease.leaseState === Models.LeaseStateType.Leased &&
        options.proposedLeaseId !== lease.leaseId
      ) {
        throw StorageErrorFactory.getLeaseAlreadyPresent(requestId);
      }

      // update the lease information
      if (options.duration === -1 || options.duration === undefined) {
        lease.leaseDuration = Models.LeaseDurationType.Infinite;
      } else {
        // verify options.duration between 15 and 60
        if (options.duration > 60 || options.duration < 15) {
          throw StorageErrorFactory.getInvalidLeaseDuration(requestId);
        }
        lease.leaseDuration = Models.LeaseDurationType.Fixed;
        lease.leaseExpireTime = context.startTime!;
        lease.leaseExpireTime.setSeconds(
          lease.leaseExpireTime.getSeconds() + options.duration
        );
        lease.leasedurationNumber = options.duration;
      }
      lease.leaseState = Models.LeaseStateType.Leased;
      lease.leaseStatus = Models.LeaseStatusType.Locked;
      lease.leaseId =
        options.proposedLeaseId !== "" && options.proposedLeaseId !== undefined
          ? options.proposedLeaseId
          : uuid();
      lease.leaseBreakExpireTime = undefined;

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
      const publicAccess = this.deserializeModelValue(res, "publicAccess");
      const hasImmutabilityPolicy = this.getModelValue<boolean>(
        res,
        "hasImmutabilityPolicy"
      );
      const hasLegalHold = this.getModelValue<boolean>(res, "hasLegalHold");

      const properties: Models.ContainerProperties = {
        etag,
        lastModified,
        publicAccess,
        hasImmutabilityPolicy,
        hasLegalHold,
        leaseDuration: lease.leaseDuration,
        leaseState: lease.leaseState,
        leaseStatus: lease.leaseStatus
      };

      await ContainersModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      return { properties, leaseId: lease.leaseId };
    });
  }

  public async releaseContainerLease(
    account: string,
    container: string,
    leaseId: string,
    context: Context
  ): Promise<Models.ContainerProperties> {
    return this.sequelize.transaction(async t => {
      const res = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (res === null || res === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const storedLeaseId = this.getModelValue<string>(res, "leaseId");
      const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
        res,
        "leaseStatus"
      );
      const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
        res,
        "leaseDuration"
      );
      const leaseState = this.getModelValue<Models.LeaseStateType>(
        res,
        "leaseState"
      );
      const leasedurationNumber = this.getModelValue<number>(
        res,
        "leasedurationNumber"
      );
      const leaseExpireTime = this.getModelValue<Date>(res, "leaseExpireTime");
      const leaseBreakExpireTime = this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      );

      let lease: IContainerLease = {
        leaseId: storedLeaseId,
        leaseStatus,
        leaseBreakExpireTime,
        leaseDuration,
        leaseExpireTime,
        leaseState,
        leasedurationNumber
      };

      lease = this.updateContainerLeaseAttributes(lease, context.startTime!);

      if (lease.leaseState === Models.LeaseStateType.Available) {
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
          requestId
        );
      }

      // Check lease ID
      if (lease.leaseId !== leaseId) {
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
          requestId
        );
      }

      // update the lease information
      lease.leaseState = Models.LeaseStateType.Available;
      lease.leaseStatus = Models.LeaseStatusType.Unlocked;
      lease.leaseDuration = undefined;
      lease.leasedurationNumber = undefined;
      lease.leaseId = undefined;
      lease.leaseExpireTime = undefined;
      lease.leaseBreakExpireTime = undefined;

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
      const publicAccess = this.deserializeModelValue(res, "publicAccess");
      const hasImmutabilityPolicy = this.getModelValue<boolean>(
        res,
        "hasImmutabilityPolicy"
      );
      const hasLegalHold = this.getModelValue<boolean>(res, "hasLegalHold");

      const properties: Models.ContainerProperties = {
        etag,
        lastModified,
        publicAccess,
        hasImmutabilityPolicy,
        hasLegalHold,
        leaseDuration: lease.leaseDuration,
        leaseState: lease.leaseState,
        leaseStatus: lease.leaseStatus
      };

      await ContainersModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      return properties;
    });
  }

  public async renewContainerLease(
    account: string,
    container: string,
    leaseId: string,
    context: Context
  ): Promise<RenewContainerLeaseRes> {
    return this.sequelize.transaction(async t => {
      const res = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (res === null || res === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const storedLeaseId = this.getModelValue<string>(res, "leaseId");
      const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
        res,
        "leaseStatus"
      );
      const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
        res,
        "leaseDuration"
      );
      const leaseState = this.getModelValue<Models.LeaseStateType>(
        res,
        "leaseState"
      );
      const leasedurationNumber = this.getModelValue<number>(
        res,
        "leasedurationNumber"
      );
      const leaseExpireTime = this.getModelValue<Date>(res, "leaseExpireTime");
      const leaseBreakExpireTime = this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      );

      let lease: IContainerLease = {
        leaseId: storedLeaseId,
        leaseStatus,
        leaseBreakExpireTime,
        leaseDuration,
        leaseExpireTime,
        leaseState,
        leasedurationNumber
      };

      lease = this.updateContainerLeaseAttributes(lease, context.startTime!);

      // check the lease action aligned with current lease state.
      if (lease.leaseState === Models.LeaseStateType.Available) {
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
          requestId
        );
      }
      if (
        lease.leaseState === Models.LeaseStateType.Breaking ||
        lease.leaseState === Models.LeaseStateType.Broken
      ) {
        throw StorageErrorFactory.getLeaseIsBrokenAndCannotBeRenewed(requestId);
      }

      // Check lease ID
      if (lease.leaseId !== leaseId) {
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
          requestId
        );
      }

      // update the lease information
      lease.leaseState = Models.LeaseStateType.Leased;
      lease.leaseStatus = Models.LeaseStatusType.Locked;
      // when container.leasedurationNumber has value (not -1), means fixed duration
      if (
        lease.leasedurationNumber !== undefined &&
        lease.leasedurationNumber !== -1
      ) {
        lease.leaseExpireTime = context.startTime!;
        lease.leaseExpireTime.setSeconds(
          lease.leaseExpireTime.getSeconds() + lease.leasedurationNumber
        );
        lease.leaseDuration = Models.LeaseDurationType.Fixed;
      } else {
        lease.leaseDuration = Models.LeaseDurationType.Infinite;
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
      const publicAccess = this.deserializeModelValue(res, "publicAccess");
      const hasImmutabilityPolicy = this.getModelValue<boolean>(
        res,
        "hasImmutabilityPolicy"
      );
      const hasLegalHold = this.getModelValue<boolean>(res, "hasLegalHold");

      const properties: Models.ContainerProperties = {
        etag,
        lastModified,
        publicAccess,
        hasImmutabilityPolicy,
        hasLegalHold,
        leaseDuration: lease.leaseDuration,
        leaseState: lease.leaseState,
        leaseStatus: lease.leaseStatus
      };

      await ContainersModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      return { properties, leaseId: lease.leaseId };
    });
  }

  public async breakContainerLease(
    account: string,
    container: string,
    breakPeriod: number | undefined,
    context: Context
  ): Promise<BreakContainerLeaseRes> {
    return this.sequelize.transaction(async t => {
      const res = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (res === null || res === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const storedLeaseId = this.getModelValue<string>(res, "leaseId");
      const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
        res,
        "leaseStatus"
      );
      const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
        res,
        "leaseDuration"
      );
      const leaseState = this.getModelValue<Models.LeaseStateType>(
        res,
        "leaseState"
      );
      const leasedurationNumber = this.getModelValue<number>(
        res,
        "leasedurationNumber"
      );
      const leaseExpireTime = this.getModelValue<Date>(res, "leaseExpireTime");
      const leaseBreakExpireTime = this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      );

      let lease: IContainerLease = {
        leaseId: storedLeaseId,
        leaseStatus,
        leaseBreakExpireTime,
        leaseDuration,
        leaseExpireTime,
        leaseState,
        leasedurationNumber
      };

      lease = this.updateContainerLeaseAttributes(lease, context.startTime!);

      let leaseTimeinSecond: number;
      leaseTimeinSecond = 0;
      // check the lease action aligned with current lease state.
      if (lease.leaseState === Models.LeaseStateType.Available) {
        throw StorageErrorFactory.getContainerLeaseNotPresentWithLeaseOperation(
          requestId
        );
      }

      // update the lease information
      // verify options.breakPeriod between 0 and 60
      if (breakPeriod !== undefined && (breakPeriod > 60 || breakPeriod < 0)) {
        throw StorageErrorFactory.getInvalidLeaseBreakPeriod(requestId);
      }
      if (
        lease.leaseState === Models.LeaseStateType.Expired ||
        lease.leaseState === Models.LeaseStateType.Broken ||
        breakPeriod === 0 ||
        breakPeriod === undefined
      ) {
        lease.leaseState = Models.LeaseStateType.Broken;
        lease.leaseStatus = Models.LeaseStatusType.Unlocked;
        lease.leaseDuration = undefined;
        lease.leasedurationNumber = undefined;
        lease.leaseExpireTime = undefined;
        lease.leaseBreakExpireTime = undefined;
        leaseTimeinSecond = 0;
      } else {
        lease.leaseState = Models.LeaseStateType.Breaking;
        lease.leaseStatus = Models.LeaseStatusType.Locked;
        lease.leasedurationNumber = undefined;
        if (lease.leaseDuration === Models.LeaseDurationType.Infinite) {
          lease.leaseDuration = undefined;
          lease.leaseExpireTime = undefined;
          lease.leaseBreakExpireTime = new Date(context.startTime!);
          lease.leaseBreakExpireTime.setSeconds(
            lease.leaseBreakExpireTime.getSeconds() + breakPeriod
          );
          leaseTimeinSecond = breakPeriod;
        } else {
          let newleaseBreakExpireTime = new Date(context.startTime!);
          newleaseBreakExpireTime.setSeconds(
            newleaseBreakExpireTime.getSeconds() + breakPeriod
          );
          if (
            lease.leaseExpireTime !== undefined &&
            newleaseBreakExpireTime > lease.leaseExpireTime
          ) {
            newleaseBreakExpireTime = lease.leaseExpireTime;
          }
          if (
            lease.leaseBreakExpireTime === undefined ||
            lease.leaseBreakExpireTime > newleaseBreakExpireTime
          ) {
            lease.leaseBreakExpireTime = newleaseBreakExpireTime;
          }
          leaseTimeinSecond = Math.round(
            Math.abs(
              lease.leaseBreakExpireTime.getTime() -
                context.startTime!.getTime()
            ) / 1000
          );
          lease.leaseExpireTime = undefined;
          lease.leaseDuration = undefined;
        }
      }

      const lastModified = this.getModelValue<Date>(res, "lastModified", true);
      const etag = this.getModelValue<string>(res, "etag", true);
      const publicAccess = this.deserializeModelValue(res, "publicAccess");
      const hasImmutabilityPolicy = this.getModelValue<boolean>(
        res,
        "hasImmutabilityPolicy"
      );
      const hasLegalHold = this.getModelValue<boolean>(res, "hasLegalHold");

      const properties: Models.ContainerProperties = {
        etag,
        lastModified,
        publicAccess,
        hasImmutabilityPolicy,
        hasLegalHold,
        leaseDuration: lease.leaseDuration,
        leaseState: lease.leaseState,
        leaseStatus: lease.leaseStatus
      };

      await ContainersModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      return { properties, leaseTime: leaseTimeinSecond };
    });
  }

  public async changeContainerLease(
    account: string,
    container: string,
    leaseId: string,
    proposedLeaseId: string,
    context: Context
  ): Promise<ChangeContainerLeaseRes> {
    return this.sequelize.transaction(async t => {
      const res = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (res === null || res === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const storedLeaseId = this.getModelValue<string>(res, "leaseId");
      const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
        res,
        "leaseStatus"
      );
      const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
        res,
        "leaseDuration"
      );
      const leaseState = this.getModelValue<Models.LeaseStateType>(
        res,
        "leaseState"
      );
      const leasedurationNumber = this.getModelValue<number>(
        res,
        "leasedurationNumber"
      );
      const leaseExpireTime = this.getModelValue<Date>(res, "leaseExpireTime");
      const leaseBreakExpireTime = this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      );

      let lease: IContainerLease = {
        leaseId: storedLeaseId,
        leaseStatus,
        leaseBreakExpireTime,
        leaseDuration,
        leaseExpireTime,
        leaseState,
        leasedurationNumber
      };

      lease = this.updateContainerLeaseAttributes(lease, context.startTime!);

      // check the lease action aligned with current lease state.
      if (
        lease.leaseState === Models.LeaseStateType.Available ||
        lease.leaseState === Models.LeaseStateType.Expired ||
        lease.leaseState === Models.LeaseStateType.Broken
      ) {
        throw StorageErrorFactory.getContainerLeaseNotPresentWithLeaseOperation(
          requestId
        );
      }
      if (lease.leaseState === Models.LeaseStateType.Breaking) {
        throw StorageErrorFactory.getLeaseIsBreakingAndCannotBeChanged(
          requestId
        );
      }

      // Check lease ID
      if (lease.leaseId !== leaseId && lease.leaseId !== proposedLeaseId) {
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
          requestId
        );
      }

      // update the lease information, only need update lease ID
      lease.leaseId = proposedLeaseId;

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
      const publicAccess = this.deserializeModelValue(res, "publicAccess");
      const hasImmutabilityPolicy = this.getModelValue<boolean>(
        res,
        "hasImmutabilityPolicy"
      );
      const hasLegalHold = this.getModelValue<boolean>(res, "hasLegalHold");

      const properties: Models.ContainerProperties = {
        etag,
        lastModified,
        publicAccess,
        hasImmutabilityPolicy,
        hasLegalHold,
        leaseDuration: lease.leaseDuration,
        leaseState: lease.leaseState,
        leaseStatus: lease.leaseStatus
      };

      await ContainersModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      return { properties, leaseId: lease.leaseId };
    });
  }

  public async checkContainerExist(
    account: string,
    container: string,
    context?: Context | undefined
  ): Promise<void> {
    const res = await ContainersModel.findOne({
      where: {
        accountName: account,
        containerName: container
      }
    });
    if (res === undefined || res === null) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getContainerNotFound(requestId);
    }
  }

  public async createSnapshot(
    account: string,
    container: string,
    blob: string,
    context: Context
  ): Promise<CreateSnapshotRes> {
    return this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        }
      });
      if (containerRes === undefined || containerRes === null) {
        const requestId = context ? context.contextID : undefined;
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          deleting: 0
        },
        transaction: t
      });

      if (res === undefined || res === null) {
        const requestId = context ? context.contextID : undefined;
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      const snapshotBlob = this.blobModelConvert(res);

      snapshotBlob.snapshot = context.startTime!.toISOString();

      await BlobsModel.upsert({
        accountName: snapshotBlob.accountName,
        containerName: snapshotBlob.containerName,
        blobName: snapshotBlob.name,
        snapshot: snapshotBlob.snapshot,
        blobType: snapshotBlob.properties.blobType,
        blobSequenceNumber: snapshotBlob.properties.blobSequenceNumber,
        isCommitted: true,
        lastModified: snapshotBlob.properties.lastModified,
        etag: snapshotBlob.properties.etag,
        persistency: this.serializeModelValue(snapshotBlob.persistency),
        committedBlocksInOrder: this.serializeModelValue(
          snapshotBlob.committedBlocksInOrder
        ),
        metadata: this.serializeModelValue(snapshotBlob.metadata) || null
      });

      return {
        properties: snapshotBlob.properties,
        snapshot: snapshotBlob.snapshot
      };
    });
  }

  public async deleteBlob(
    account: string,
    container: string,
    blob: string,
    options: Models.BlobDeleteMethodOptionalParams,
    context: Context
  ): Promise<void> {
    await this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        attributes: [
          "leaseId",
          "leaseStatus",
          "leaseDuration",
          "leaseState",
          "leasedurationNumber",
          "leaseExpireTime",
          "leaseBreakExpireTime",
          "snapshot"
        ],
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: options.snapshot === undefined ? "" : options.snapshot,
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      const lease = this.getBlobLease(res, context);

      const snapshot = this.getModelValue<string>(res, "snapshot", true);
      const againstBaseBlob = snapshot === "";
      if (againstBaseBlob) {
        this.checkBlobLeaseOnWriteBlob(
          lease.leaseId,
          lease.leaseStatus,
          options.leaseAccessConditions,
          requestId
        );
      }

      // Check bad requests
      if (!againstBaseBlob && options.deleteSnapshots !== undefined) {
        throw StorageErrorFactory.getInvalidOperation(
          context.contextID!,
          "Invalid operation against a blob snapshot."
        );
      }

      // Scenario: Delete base blob only
      if (againstBaseBlob && options.deleteSnapshots === undefined) {
        const count = await BlobsModel.count({
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            deleting: 0
          },
          transaction: t
        });
        if (count > 1) {
          throw StorageErrorFactory.getSnapshotsPresent(context.contextID!);
        } else {
          await BlobsModel.update(
            {
              deleting: literal("deleting + 1")
            },
            {
              where: {
                accountName: account,
                containerName: container,
                blobName: blob
              },
              transaction: t
            }
          );

          await BlocksModel.update(
            {
              deleting: literal("deleting + 1")
            },
            {
              where: {
                accountName: account,
                containerName: container,
                blobName: blob
              },
              transaction: t
            }
          );
        }
      }

      // Scenario: Delete one snapshot only
      if (!againstBaseBlob) {
        await BlobsModel.update(
          {
            deleting: literal("deleting + 1")
          },
          {
            where: {
              accountName: account,
              containerName: container,
              blobName: blob,
              snapshot
            },
            transaction: t
          }
        );
      }

      // Scenario: Delete base blob and snapshots
      if (
        againstBaseBlob &&
        options.deleteSnapshots === Models.DeleteSnapshotsOptionType.Include
      ) {
        await BlobsModel.update(
          {
            deleting: literal("deleting + 1")
          },
          {
            where: {
              accountName: account,
              containerName: container,
              blobName: blob
            },
            transaction: t
          }
        );

        await BlocksModel.update(
          {
            deleting: literal("deleting + 1")
          },
          {
            where: {
              accountName: account,
              containerName: container,
              blobName: blob
            },
            transaction: t
          }
        );
      }

      // Scenario: Delete all snapshots only
      if (
        againstBaseBlob &&
        options.deleteSnapshots === Models.DeleteSnapshotsOptionType.Only
      ) {
        await BlobsModel.update(
          {
            deleting: literal("deleting + 1")
          },
          {
            where: {
              accountName: account,
              containerName: container,
              blobName: blob,
              snapshot: { [Op.gt]: "" }
            },
            transaction: t
          }
        );
      }
    });
  }
  public async setBlobHTTPHeaders(
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    blobHTTPHeaders: Models.BlobHTTPHeaders | undefined,
    context: Context
  ): Promise<Models.BlobProperties> {
    return this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      let lease = this.getBlobLease(res, context);

      // Check Lease status
      this.checkBlobLeaseOnWriteBlob(
        lease.leaseId,
        lease.leaseStatus,
        leaseAccessConditions,
        requestId
      );

      lease = this.UpdateBlobLeaseStateOnWriteBlob(lease);

      const etag = this.getModelValue<string>(res, "etag", true);
      const blobType = this.getModelValue<Models.BlobType>(res, "blobType");
      const accessTier = this.getModelValue<Models.AccessTier>(
        res,
        "accessTier"
      );
      const blobSequenceNumber = this.getModelValue<number>(
        res,
        "blobSequenceNumber"
      );
      let lastModified = this.getModelValue<Date>(res, "lastModified", true);
      let contentProperties: IBlobContentProperties = this.deserializeModelValue(
        res,
        "contentProperties"
      );

      if (blobHTTPHeaders !== undefined) {
        contentProperties.cacheControl = blobHTTPHeaders.blobCacheControl;
        contentProperties.contentType = blobHTTPHeaders.blobContentType;
        contentProperties.contentMD5 = blobHTTPHeaders.blobContentMD5;
        contentProperties.contentEncoding = blobHTTPHeaders.blobContentEncoding;
        contentProperties.contentLanguage = blobHTTPHeaders.blobContentLanguage;
        contentProperties.contentDisposition =
          blobHTTPHeaders.blobContentDisposition;
        lastModified = context.startTime ? context.startTime : new Date();
      }

      await BlobsModel.update(
        {
          lastModified,
          contentProperties: this.serializeModelValue(contentProperties),
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: "",
            deleting: 0
          },
          transaction: t
        }
      );

      const ret: Models.BlobProperties = {
        ...contentProperties,
        lastModified,
        etag,
        blobType,
        blobSequenceNumber,
        accessTier,
        leaseStatus: lease.leaseStatus,
        leaseDuration: lease.leaseDuration,
        leaseState: lease.leaseState
      };
      return ret;
    });
  }
  public setBlobMetadata(
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    metadata: Models.BlobMetadata | undefined,
    context: Context
  ): Promise<Models.BlobProperties> {
    return this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      let lease = this.getBlobLease(res, context);

      // Check Lease status
      this.checkBlobLeaseOnWriteBlob(
        lease.leaseId,
        lease.leaseStatus,
        leaseAccessConditions,
        requestId
      );

      lease = this.UpdateBlobLeaseStateOnWriteBlob(lease);

      const etag = this.getModelValue<string>(res, "etag", true);
      let lastModified = this.getModelValue<Date>(res, "lastModified", true);

      await BlobsModel.update(
        {
          metadata: this.serializeModelValue(metadata) || null,
          lastModified,
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: "",
            deleting: 0
          },
          transaction: t
        }
      );

      const ret: Models.BlobProperties = {
        lastModified,
        etag,
        leaseStatus: lease.leaseStatus,
        leaseDuration: lease.leaseDuration,
        leaseState: lease.leaseState
      };

      return ret;
    });
  }

  public async acquireBlobLease(
    account: string,
    container: string,
    blob: string,
    options: Models.BlobAcquireLeaseOptionalParams,
    context: Context
  ): Promise<AcquireBlobLeaseRes> {
    return this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      const lease = this.getBlobLease(res, context);
      // check the lease action aligned with current lease state.
      const snapshot = this.getModelValue<string>(res, "snapshot", true);
      if (snapshot !== "") {
        throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
      }
      if (lease.leaseState === Models.LeaseStateType.Breaking) {
        throw StorageErrorFactory.getLeaseAlreadyPresent(context.contextID!);
      }
      if (
        lease.leaseState === Models.LeaseStateType.Leased &&
        options.proposedLeaseId !== lease.leaseId
      ) {
        throw StorageErrorFactory.getLeaseAlreadyPresent(context.contextID!);
      }

      // update the lease information
      if (options.duration === -1 || options.duration === undefined) {
        lease.leaseDuration = Models.LeaseDurationType.Infinite;
      } else {
        // verify options.duration between 15 and 60
        if (options.duration > 60 || options.duration < 15) {
          throw StorageErrorFactory.getInvalidLeaseDuration(context.contextID!);
        }
        lease.leaseDuration = Models.LeaseDurationType.Fixed;
        lease.leaseExpireTime = context.startTime!;
        lease.leaseExpireTime.setSeconds(
          lease.leaseExpireTime.getSeconds() + options.duration
        );
        lease.leasedurationNumber = options.duration;
      }
      lease.leaseState = Models.LeaseStateType.Leased;
      lease.leaseStatus = Models.LeaseStatusType.Locked;
      lease.leaseId =
        options.proposedLeaseId !== "" && options.proposedLeaseId !== undefined
          ? options.proposedLeaseId
          : uuid();
      lease.leaseBreakExpireTime = undefined;

      const properties: Models.BlobProperties = {
        etag: this.getModelValue<string>(res, "etag", true),
        lastModified: this.getModelValue<Date>(res, "lastModified", true)
      };

      await BlobsModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: "",
            deleting: 0
          },
          transaction: t
        }
      );
      return { properties, leaseId: lease.leaseId };
    });
  }

  public async releaseBlobLease(
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    context: Context
  ): Promise<ReleaseBlobLeaseRes> {
    return this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      const lease = this.getBlobLease(res, context);

      const snapshot = this.getModelValue<string>(res, "snapshot", true);
      // check the lease action aligned with current lease state.
      if (snapshot !== "") {
        throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
      }
      if (lease.leaseState === Models.LeaseStateType.Available) {
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
          context.contextID!
        );
      }

      // Check lease ID
      if (lease.leaseId !== leaseId) {
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
          context.contextID!
        );
      }

      // update the lease information
      lease.leaseState = Models.LeaseStateType.Available;
      lease.leaseStatus = Models.LeaseStatusType.Unlocked;
      lease.leaseDuration = undefined;
      lease.leasedurationNumber = undefined;
      lease.leaseId = undefined;
      lease.leaseExpireTime = undefined;
      lease.leaseBreakExpireTime = undefined;

      const properties: Models.BlobProperties = {
        etag: this.getModelValue<string>(res, "etag", true),
        lastModified: this.getModelValue<Date>(res, "lastModified", true)
      };

      await BlobsModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: "",
            deleting: 0
          },
          transaction: t
        }
      );
      return properties;
    });
  }
  public async renewBlobLease(
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    context: Context
  ): Promise<RenewBlobLeaseRes> {
    return this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      const lease = this.getBlobLease(res, context);

      const snapshot = this.getModelValue<string>(res, "snapshot", true);
      // check the lease action aligned with current lease state.
      if (snapshot !== "") {
        throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
      }
      if (lease.leaseState === Models.LeaseStateType.Available) {
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
          context.contextID!
        );
      }
      if (
        lease.leaseState === Models.LeaseStateType.Breaking ||
        lease.leaseState === Models.LeaseStateType.Broken
      ) {
        throw StorageErrorFactory.getLeaseIsBrokenAndCannotBeRenewed(
          context.contextID!
        );
      }

      // Check lease ID
      if (lease.leaseId !== leaseId) {
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
          context.contextID!
        );
      }

      // update the lease information
      lease.leaseState = Models.LeaseStateType.Leased;
      lease.leaseStatus = Models.LeaseStatusType.Locked;
      // when container.leaseduration has value (not -1), means fixed duration
      if (
        lease.leasedurationNumber !== undefined &&
        lease.leasedurationNumber !== -1
      ) {
        lease.leaseExpireTime = context.startTime!;
        lease.leaseExpireTime.setSeconds(
          lease.leaseExpireTime.getSeconds() + lease.leasedurationNumber
        );
        lease.leaseDuration = Models.LeaseDurationType.Fixed;
      } else {
        lease.leaseDuration = Models.LeaseDurationType.Infinite;
      }

      const properties: Models.BlobProperties = {
        etag: this.getModelValue<string>(res, "etag", true),
        lastModified: this.getModelValue<Date>(res, "lastModified", true)
      };

      await BlobsModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: "",
            deleting: 0
          },
          transaction: t
        }
      );
      return { properties, leaseId: lease.leaseId };
    });
  }

  public async changeBlobLease(
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    proposedLeaseId: string,
    context: Context
  ): Promise<ChangeBlobLeaseRes> {
    return this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      const lease = this.getBlobLease(res, context);

      const snapshot = this.getModelValue<string>(res, "snapshot", true);
      // check the lease action aligned with current lease state.
      if (snapshot !== "") {
        throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
      }
      if (
        lease.leaseState === Models.LeaseStateType.Available ||
        lease.leaseState === Models.LeaseStateType.Expired ||
        lease.leaseState === Models.LeaseStateType.Broken
      ) {
        throw StorageErrorFactory.getBlobLeaseNotPresentWithLeaseOperation(
          context.contextID!
        );
      }
      if (lease.leaseState === Models.LeaseStateType.Breaking) {
        throw StorageErrorFactory.getLeaseIsBreakingAndCannotBeChanged(
          context.contextID!
        );
      }

      // Check lease ID
      if (lease.leaseId !== leaseId && lease.leaseId !== proposedLeaseId) {
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
          context.contextID!
        );
      }

      // update the lease information, only need update lease ID
      lease.leaseId = proposedLeaseId;

      const properties: Models.BlobProperties = {
        etag: this.getModelValue<string>(res, "etag", true),
        lastModified: this.getModelValue<Date>(res, "lastModified", true)
      };

      await BlobsModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: "",
            deleting: 0
          },
          transaction: t
        }
      );
      return { properties, leaseId: lease.leaseId };
    });
  }

  public async breakBlobLease(
    account: string,
    container: string,
    blob: string,
    breakPeriod: number | undefined,
    context: Context
  ): Promise<BreakBlobLeaseRes> {
    return this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      const lease = this.getBlobLease(res, context);

      let leaseTimeinSecond: number = 0;
      const snapshot = this.getModelValue<string>(res, "snapshot", true);
      // check the lease action aligned with current lease state.
      if (snapshot !== "") {
        throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
      }
      if (lease.leaseState === Models.LeaseStateType.Available) {
        throw StorageErrorFactory.getBlobLeaseNotPresentWithLeaseOperation(
          context.contextID!
        );
      }

      // update the lease information
      // verify options.breakPeriod between 0 and 60
      if (breakPeriod !== undefined && (breakPeriod > 60 || breakPeriod < 0)) {
        throw StorageErrorFactory.getInvalidLeaseBreakPeriod(
          context.contextID!
        );
      }
      if (
        lease.leaseState === Models.LeaseStateType.Expired ||
        lease.leaseState === Models.LeaseStateType.Broken ||
        breakPeriod === 0 ||
        breakPeriod === undefined
      ) {
        lease.leaseState = Models.LeaseStateType.Broken;
        lease.leaseStatus = Models.LeaseStatusType.Unlocked;
        lease.leaseDuration = undefined;
        lease.leasedurationNumber = undefined;
        lease.leaseExpireTime = undefined;
        lease.leaseBreakExpireTime = undefined;
        leaseTimeinSecond = 0;
      } else {
        lease.leaseState = Models.LeaseStateType.Breaking;
        lease.leaseStatus = Models.LeaseStatusType.Locked;
        lease.leasedurationNumber = undefined;
        if (lease.leaseDuration === Models.LeaseDurationType.Infinite) {
          lease.leaseDuration = undefined;
          lease.leaseExpireTime = undefined;
          lease.leaseBreakExpireTime = new Date(context.startTime!);
          lease.leaseBreakExpireTime.setSeconds(
            lease.leaseBreakExpireTime.getSeconds() + breakPeriod
          );
          leaseTimeinSecond = breakPeriod;
        } else {
          let newleaseBreakExpireTime = new Date(context.startTime!);
          newleaseBreakExpireTime.setSeconds(
            newleaseBreakExpireTime.getSeconds() + breakPeriod
          );
          if (
            lease.leaseExpireTime !== undefined &&
            newleaseBreakExpireTime > lease.leaseExpireTime
          ) {
            newleaseBreakExpireTime = lease.leaseExpireTime;
          }
          if (
            lease.leaseBreakExpireTime === undefined ||
            lease.leaseBreakExpireTime > newleaseBreakExpireTime
          ) {
            lease.leaseBreakExpireTime = newleaseBreakExpireTime;
          }
          leaseTimeinSecond = Math.round(
            Math.abs(
              lease.leaseBreakExpireTime.getTime() -
                context.startTime!.getTime()
            ) / 1000
          );
          lease.leaseExpireTime = undefined;
          lease.leaseDuration = undefined;
        }
      }

      const properties: Models.BlobProperties = {
        etag: this.getModelValue<string>(res, "etag", true),
        lastModified: this.getModelValue<Date>(res, "lastModified", true)
      };

      await BlobsModel.update(
        {
          leaseStatus: lease.leaseStatus ? lease.leaseStatus : null,
          leaseState: lease.leaseState ? lease.leaseState : null,
          leaseDuration: lease.leaseDuration ? lease.leaseDuration : null,
          leaseId: lease.leaseId ? lease.leaseId : null,
          leasedurationNumber: lease.leasedurationNumber
            ? lease.leasedurationNumber
            : null,
          leaseExpireTime: lease.leaseExpireTime ? lease.leaseExpireTime : null,
          leaseBreakExpireTime: lease.leaseBreakExpireTime
            ? lease.leaseBreakExpireTime
            : null
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: "",
            deleting: 0
          },
          transaction: t
        }
      );
      return { properties, leaseTime: leaseTimeinSecond };
    });
  }

  public async checkBlobExist(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined,
    context?: Context | undefined
  ): Promise<void> {
    await this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: snapshot ? snapshot : "",
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }
    });
  }

  public async getBlobType(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<
    { blobType: Models.BlobType | undefined; isCommitted: boolean } | undefined
  > {
    const res = await BlobsModel.findOne({
      where: {
        accountName: account,
        containerName: container,
        blobName: blob,
        snapshot: snapshot ? snapshot : "",
        deleting: 0
      }
    });

    if (res === null || res === undefined) {
      return undefined;
    }

    const blobType = this.getModelValue<Models.BlobType>(res, "blobType", true);
    const isCommitted = this.getModelValue<boolean>(res, "iscommitted", true);

    return { blobType, isCommitted };
  }

  public startCopyFromURL(
    source: BlobId,
    destination: BlobId,
    copySource: string,
    metadata: Models.BlobMetadata | undefined,
    tier: Models.AccessTier | undefined,
    context: Context
  ): Promise<Models.BlobProperties> {
    throw new Error("Method not implemented.");
  }
  public setTier(
    account: string,
    container: string,
    blob: string,
    tier: Models.AccessTier,
    context: Context
  ): Promise<200 | 202> {
    return this.sequelize.transaction(async t => {
      const containerRes = await ContainersModel.findOne({
        attributes: ["accountName"],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      const requestId = context ? context.contextID : undefined;
      if (containerRes === null || containerRes === undefined) {
        throw StorageErrorFactory.getContainerNotFound(requestId);
      }

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          deleting: 0
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(requestId);
      }

      let responseCode: 200 | 202 = 200;

      // check the lease action aligned with current lease state.
      // the API has not lease ID input, but run it on a lease blocked blob will fail with LeaseIdMissing,
      // this is aliged with server behavior
      const lease = this.getBlobLease(res, context);
      this.checkBlobLeaseOnWriteBlob(
        lease.leaseId,
        lease.leaseStatus,
        undefined,
        requestId
      );
      // Check Blob is not snapshot
      const snapshot = this.getModelValue<string>(res, "snapshot");
      if (snapshot !== "") {
        throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
      }

      // Check BlobTier matches blob type
      let accessTier = this.getModelValue<Models.AccessTier>(res, "accessTier");
      const blobType = this.getModelValue<Models.BlobType>(res, "blobType");
      if (
        (tier === Models.AccessTier.Archive ||
          tier === Models.AccessTier.Cool ||
          tier === Models.AccessTier.Hot) &&
        blobType === Models.BlobType.BlockBlob
      ) {
        // Block blob
        // tslint:disable-next-line:max-line-length
        // TODO: check blob is not block blob with snapshot, throw StorageErrorFactory.getBlobSnapshotsPresent_hassnapshot()

        // Archive -> Coo/Hot will return 202
        if (
          accessTier === Models.AccessTier.Archive &&
          (tier === Models.AccessTier.Cool || tier === Models.AccessTier.Hot)
        ) {
          responseCode = 202;
        }

        accessTier = tier;
      } else {
        throw StorageErrorFactory.getBlobInvalidBlobType(context.contextID!);
      }
      await BlobsModel.update(
        {
          accessTier
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: "",
            deleting: 0
          },
          transaction: t
        }
      );

      return responseCode;
    });
  }
  public uploadPages(
    blob: BlobModel,
    start: number,
    end: number,
    persistencycontext: import("./IBlobMetadataStore").IPersistencyChunk,
    context?: Context | undefined
  ): Promise<Models.BlobProperties> {
    throw new Error("Method not implemented.");
  }
  public clearRange(
    blob: BlobModel,
    start: number,
    end: number,
    context?: Context | undefined
  ): Promise<Models.BlobProperties> {
    throw new Error("Method not implemented.");
  }
  public getPageRanges(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined,
    context?: Context | undefined
  ): Promise<GetPageRangeRes> {
    throw new Error("Method not implemented.");
  }
  public resizePageBlob(
    account: string,
    container: string,
    blob: string,
    blobContentLength: number,
    context: Context
  ): Promise<Models.BlobProperties> {
    throw new Error("Method not implemented.");
  }
  public updateSequenceNumber(
    account: string,
    container: string,
    blob: string,
    sequenceNumberAction: Models.SequenceNumberActionType,
    blobSequenceNumber: number | undefined,
    context: Context
  ): Promise<Models.BlobProperties> {
    throw new Error("Method not implemented.");
  }
  public listBlocks<T extends BlockModel>(
    account?: string | undefined,
    container?: string | undefined,
    blob?: string | undefined,
    isCommitted?: boolean | undefined
  ): Promise<T[]> {
    throw new Error("Method not implemented.");
  }
  public iteratorReferredExtents(): AsyncIterator<
    import("./IBlobMetadataStore").IPersistencyChunk[]
  > {
    throw new Error("Method not implemented.");
  }

  private getModelValue<T>(model: Model, key: string): T | undefined;
  private getModelValue<T>(model: Model, key: string, isRequired: true): T;
  private getModelValue<T>(
    model: Model,
    key: string,
    isRequired?: boolean
  ): T | undefined {
    let value = model.get(key) as T | undefined;
    if (value === null) {
      value = undefined;
    }
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

  /**
   * Check Container lease status on Read Container.
   *
   * @private
   * @param {(string | undefined)} leaseId
   * @param {(Models.LeaseStatusType | undefined)} leaseStatus
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {string} [requestId]
   * @memberof SqlBlobMetadataStore
   */
  private checkLeaseOnReadContainer(
    leaseId: string | undefined,
    leaseStatus: Models.LeaseStatusType | undefined,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    requestId?: string
  ): void {
    // check only when input Leased Id is not empty
    if (
      leaseAccessConditions !== undefined &&
      leaseAccessConditions.leaseId !== undefined &&
      leaseAccessConditions.leaseId !== ""
    ) {
      // return error when lease is unlocked
      if (leaseStatus === Models.LeaseStatusType.Unlocked) {
        throw StorageErrorFactory.getContainerLeaseLost(requestId);
      } else if (
        leaseId !== undefined &&
        leaseAccessConditions.leaseId.toLowerCase() !== leaseId.toLowerCase()
      ) {
        // return error when lease is locked but lease ID not match
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithContainerOperation(
          requestId
        );
      }
    }
  }

  /**
   * Check Blob lease status on Read blob.
   *
   * @private
   * @param {(string | undefined)} leaseId
   * @param {(Models.LeaseStatusType | undefined)} leaseStatus
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {string} [requestId]
   * @memberof SqlBlobMetadataStore
   */
  private checkLeaseOnReadBlob(
    leaseId: string | undefined,
    leaseStatus: Models.LeaseStatusType | undefined,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    requestId?: string
  ): void {
    // check only when input Leased Id is not empty
    if (
      leaseAccessConditions !== undefined &&
      leaseAccessConditions.leaseId !== undefined &&
      leaseAccessConditions.leaseId !== ""
    ) {
      // return error when lease is unlocked
      if (leaseStatus === Models.LeaseStatusType.Unlocked) {
        throw StorageErrorFactory.getBlobLeaseLost(requestId);
      } else if (
        leaseId !== undefined &&
        leaseAccessConditions.leaseId.toLowerCase() !== leaseId.toLowerCase()
      ) {
        // return error when lease is locked but lease ID not match
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithBlobOperation(
          requestId
        );
      }
    }
  }

  /**
   * Check Blob lease status on write blob.
   *
   * Need run the funtion on: PutBlob, SetBlobMetadata, SetBlobProperties,
   * DeleteBlob, PutBlock, PutBlockList, PutPage, AppendBlock, CopyBlob(dest)
   *
   * @private
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {LeaseAccessConditions} leaseAccessConditions
   * @returns {void}
   * @memberof BlobHandler
   */
  private checkBlobLeaseOnWriteBlob(
    leaseId: string | undefined,
    leaseStatus: Models.LeaseStatusType | undefined,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    requestId?: string
  ): void {
    // check Leased -> Expired
    if (leaseStatus === Models.LeaseStatusType.Locked) {
      if (
        leaseAccessConditions === undefined ||
        leaseAccessConditions.leaseId === undefined ||
        leaseAccessConditions.leaseId === ""
      ) {
        throw StorageErrorFactory.getBlobLeaseIdMissing(requestId);
      } else if (
        leaseId !== undefined &&
        leaseAccessConditions.leaseId.toLowerCase() !== leaseId.toLowerCase()
      ) {
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithBlobOperation(
          requestId
        );
      }
    } else if (
      leaseAccessConditions !== undefined &&
      leaseAccessConditions.leaseId !== undefined &&
      leaseAccessConditions.leaseId !== ""
    ) {
      throw StorageErrorFactory.getBlobLeaseLost(requestId);
    }
  }

  /**
   * Update lease Expire Blob lease status to Available on write blob.
   *
   * Need run the funtion on: PutBlob, SetBlobMetadata, SetBlobProperties,
   * DeleteBlob, PutBlock, PutBlockList, PutPage, AppendBlock, CopyBlob(dest)
   * @private
   * @param {IBlobLease} blob
   * @returns {IBlobLease}
   * @memberof SqlBlobMetadataStore
   */
  private UpdateBlobLeaseStateOnWriteBlob(blob: IBlobLease): IBlobLease {
    if (
      blob.leaseState === Models.LeaseStateType.Expired ||
      blob.leaseState === Models.LeaseStateType.Broken
    ) {
      blob.leaseState = Models.LeaseStateType.Available;
      blob.leaseStatus = Models.LeaseStatusType.Unlocked;
      blob.leaseDuration = undefined;
      blob.leasedurationNumber = undefined;
      blob.leaseId = undefined;
      blob.leaseExpireTime = undefined;
      blob.leaseBreakExpireTime = undefined;
    }
    return blob;
  }

  /**
   * Update container lease Attributes according to the current time.
   * The Attribute not set back
   *
   * @private
   * @param {IContainerLease} container
   * @param {Date} currentTime
   * @returns {IContainerLease}
   * @memberof SqlBlobMetadataStore
   */
  private updateContainerLeaseAttributes(
    container: IContainerLease,
    currentTime: Date
  ): IContainerLease {
    // check Leased -> Expired
    if (
      container.leaseState === Models.LeaseStateType.Leased &&
      container.leaseDuration === Models.LeaseDurationType.Fixed
    ) {
      if (
        container.leaseExpireTime !== undefined &&
        currentTime > container.leaseExpireTime
      ) {
        container.leaseState = Models.LeaseStateType.Expired;
        container.leaseStatus = Models.LeaseStatusType.Unlocked;
        container.leaseDuration = undefined;
        container.leaseExpireTime = undefined;
        container.leaseBreakExpireTime = undefined;
      }
    }

    // check Breaking -> Broken
    if (container.leaseState === Models.LeaseStateType.Breaking) {
      if (
        container.leaseBreakExpireTime !== undefined &&
        currentTime > container.leaseBreakExpireTime
      ) {
        container.leaseState = Models.LeaseStateType.Broken;
        container.leaseStatus = Models.LeaseStatusType.Unlocked;
        container.leaseDuration = undefined;
        container.leaseExpireTime = undefined;
        container.leaseBreakExpireTime = undefined;
      }
    }
    return container;
  }

  /**
   * Update Blob lease Attributes according to the current time.
   * The Attribute not set back
   *
   * @static
   * @param {IBlobLease} blob
   * @param {Date} currentTime
   * @returns {IBlobLease}
   * @memberof SqlBlobMetadataStore
   */
  private updateBlobLeaseAttributes(
    blob: IBlobLease,
    currentTime: Date
  ): IBlobLease {
    // check Leased -> Expired
    if (
      blob.leaseState === Models.LeaseStateType.Leased &&
      blob.leaseDuration === Models.LeaseDurationType.Fixed
    ) {
      if (
        blob.leaseExpireTime !== undefined &&
        currentTime > blob.leaseExpireTime
      ) {
        blob.leaseState = Models.LeaseStateType.Expired;
        blob.leaseStatus = Models.LeaseStatusType.Unlocked;
        blob.leaseDuration = undefined;
        blob.leaseExpireTime = undefined;
        blob.leaseBreakExpireTime = undefined;
      }
    }

    // check Breaking -> Broken
    if (blob.leaseState === Models.LeaseStateType.Breaking) {
      if (
        blob.leaseBreakExpireTime !== undefined &&
        currentTime > blob.leaseBreakExpireTime
      ) {
        blob.leaseState = Models.LeaseStateType.Broken;
        blob.leaseStatus = Models.LeaseStatusType.Unlocked;
        blob.leaseDuration = undefined;
        blob.leaseExpireTime = undefined;
        blob.leaseBreakExpireTime = undefined;
      }
    }
    return blob;
  }

  private getBlobLease(blob: BlobsModel, context?: Context): IBlobLease {
    const leaseId = this.getModelValue<string>(blob, "leaseId");
    const leaseStatus = this.getModelValue<Models.LeaseStatusType>(
      blob,
      "leaseStatus"
    );
    const leaseDuration = this.getModelValue<Models.LeaseDurationType>(
      blob,
      "leaseDuration"
    );
    const leaseState = this.getModelValue<Models.LeaseStateType>(
      blob,
      "leaseState"
    );
    const leasedurationNumber = this.getModelValue<number>(
      blob,
      "leasedurationNumber"
    );
    const leaseExpireTime = this.getModelValue<Date>(blob, "leaseExpireTime");
    const leaseBreakExpireTime = this.getModelValue<Date>(
      blob,
      "leaseBreakExpireTime"
    );

    let lease: IContainerLease = {
      leaseId,
      leaseStatus,
      leaseBreakExpireTime,
      leaseDuration,
      leaseExpireTime,
      leaseState,
      leasedurationNumber
    };

    lease = this.updateBlobLeaseAttributes(
      lease,
      context ? context.startTime! : new Date()
    );

    return lease;
  }

  private blobModelConvert(res: BlobsModel): BlobModel {
    const contentProperties: IBlobContentProperties = this.deserializeModelValue(
      res,
      "contentProperties"
    );
    return {
      accountName: this.getModelValue<string>(res, "accountName", true),
      containerName: this.getModelValue<string>(res, "containerName", true),
      name: this.getModelValue<string>(res, "blobName", true),
      snapshot: this.getModelValue<string>(res, "snapshot", true),
      isCommitted: this.getModelValue<boolean>(res, "isCommitted", true),
      properties: {
        lastModified: this.getModelValue<Date>(res, "lastModified", true),
        etag: this.getModelValue<string>(res, "etag", true),
        leaseDuration: this.getModelValue<Models.LeaseDurationType>(
          res,
          "leaseDuration"
        ),
        leaseState: this.getModelValue<Models.LeaseStateType>(
          res,
          "leaseState"
        ),
        leaseStatus: this.getModelValue<Models.LeaseStatusType>(
          res,
          "leaseStatus"
        ),
        accessTier: this.getModelValue<Models.AccessTier>(res, "accessTier"),
        blobSequenceNumber: this.getModelValue<number>(
          res,
          "blobSequenceNumber"
        ),
        blobType: this.getModelValue<Models.BlobType>(res, "blobType"),
        contentMD5: contentProperties
          ? this.restoreUint8Array(contentProperties.contentMD5)
          : undefined,
        contentDisposition: contentProperties
          ? contentProperties.contentDisposition
          : undefined,
        contentEncoding: contentProperties
          ? contentProperties.contentEncoding
          : undefined,
        contentLanguage: contentProperties
          ? contentProperties.contentLanguage
          : undefined,
        contentLength: contentProperties
          ? contentProperties.contentLength
          : undefined,
        contentType: contentProperties
          ? contentProperties.contentType
          : undefined,
        cacheControl: contentProperties
          ? contentProperties.cacheControl
          : undefined
      },
      leaseduration: this.getModelValue<number>(res, "leasedurationNumber"),
      leaseBreakExpireTime: this.getModelValue<Date>(
        res,
        "leaseBreakExpireTime"
      ),
      leaseExpireTime: this.getModelValue<Date>(res, "leaseExpireTime"),
      leaseId: this.getModelValue<string>(res, "leaseId"),
      persistency: this.deserializeModelValue(res, "persistency"),
      committedBlocksInOrder: this.deserializeModelValue(
        res,
        "committedBlocksInOrder"
      ),
      metadata: this.deserializeModelValue(res, "metadata")
    };
  }

  /**
   * This method will restore object to Uint8Array.
   *
   * @private
   * @param {*} obj
   * @returns {(Uint8Array | undefined)}
   * @memberof LokiBlobMetadataStore
   */
  private restoreUint8Array(obj: any): Uint8Array | undefined {
    if (typeof obj !== "object") {
      return undefined;
    }

    if (obj instanceof Uint8Array) {
      return obj;
    }

    if (obj.type === "Buffer") {
      obj = obj.data;
    }

    const length = Object.keys(obj).length;
    const arr = Buffer.allocUnsafe(length);

    for (let i = 0; i < length; i++) {
      if (!obj.hasOwnProperty(i)) {
        throw new TypeError(
          `Cannot restore sql DB persisted object to Uint8Array. Key ${i} is missing.`
        );
      }

      arr[i] = obj[i];
    }

    return arr;
  }
}
