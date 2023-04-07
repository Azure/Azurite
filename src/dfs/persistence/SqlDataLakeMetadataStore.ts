import {
  BOOLEAN,
  DATE,
  INTEGER,
  Model,
  Op,
  Options as SequelizeOptions,
  Sequelize,
  Transaction,
  TEXT,
  ModelIndexesOptions
} from "sequelize";

import uuid from "uuid/v4";

import {
  DEFAULT_SQL_CHARSET,
  DEFAULT_SQL_COLLATE
} from "../../common/utils/constants";
import { convertDateTimeStringMsTo7Digital } from "../../common/utils/utils";
import { newEtag } from "../../common/utils/utils";
import { validateReadConditions } from "../conditions/ReadConditionalHeadersValidator";
import { validateWriteConditions } from "../conditions/WriteConditionalHeadersValidator";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import BlobLeaseAdapter from "../lease/BlobLeaseAdapter";
import BlobLeaseSyncer from "../lease/BlobLeaseSyncer";
import BlobReadLeaseValidator from "../lease/BlobReadLeaseValidator";
import BlobWriteLeaseSyncer from "../lease/BlobWriteLeaseSyncer";
import BlobWriteLeaseValidator from "../lease/BlobWriteLeaseValidator";
import ContainerDeleteLeaseValidator from "../lease/ContainerDeleteLeaseValidator";
import ContainerLeaseAdapter from "../lease/ContainerLeaseAdapter";
import ContainerLeaseSyncer from "../lease/ContainerLeaseSyncer";
import ContainerReadLeaseValidator from "../lease/ContainerReadLeaseValidator";
import { ILease } from "../lease/ILeaseState";
import LeaseFactory from "../lease/LeaseFactory";
import {
  DEFAULT_FILE_PERMISSIONS,
  DEFAULT_GROUP,
  DEFAULT_LIST_BLOBS_MAX_RESULTS,
  DEFAULT_LIST_CONTAINERS_MAX_RESULTS,
  DEFAULT_OWNER,
  MAX_APPEND_BLOB_BLOCK_COUNT
} from "../utils/constants";
import BlobReferredExtentsAsyncIterator from "./BlobReferredExtentsAsyncIterator";
import IDataLakeMetadataStore, {
  AcquireBlobLeaseResponse,
  AcquireContainerLeaseResponse,
  BlobId,
  BlobModel,
  BlobPrefixModel,
  BlockModel,
  BreakBlobLeaseResponse,
  BreakContainerLeaseResponse,
  ChangeBlobLeaseResponse,
  ChangeContainerLeaseResponse,
  ContainerModel,
  CreateSnapshotResponse,
  GetBlobPropertiesRes,
  GetContainerAccessPolicyResponse,
  GetPageRangeResponse,
  IContainerMetadata,
  IExtentChunk,
  PersistencyBlockModel,
  ReleaseBlobLeaseResponse,
  RenewBlobLeaseResponse,
  RenewContainerLeaseResponse,
  ServicePropertiesModel,
  SetContainerAccessPolicyOptions
} from "./IDataLakeMetadataStore";
import PageWithDelimiter from "./PageWithDelimiter";
import { removeSlash } from "../utils/utils";
import NotImplementedError from "../errors/NotImplementedError";
import {
  toAcl,
  toAclString,
  toPermissions,
  toPermissionsString
} from "../storage-file-datalake/transforms";

// tslint:disable: max-classes-per-file
class ServicesModel extends Model {}
class ContainersModel extends Model {}
class BlobsModel extends Model {}
class BlocksModel extends Model {}
// class PagesModel extends Model {}

/**
 * A SQL based Blob metadata storage implementation based on Sequelize.
 * Refer to CONTRIBUTION.md for how to setup SQL database environment.
 *
 * @export
 * @class SqlDataLakeMetadataStore
 * @implements {IBlobMetadataStore}
 */
export default class SqlDataLakeMetadataStore
  implements IDataLakeMetadataStore
{
  private initialized: boolean = false;
  private closed: boolean = false;
  private readonly sequelize: Sequelize;
  private readonly isPostgres: boolean;

  /**
   * Creates an instance of SqlBlobMetadataStore.
   *
   * @param {string} connectionURI For example, "postgres://user:pass@example.com:5432/dbname"
   * @param {SequelizeOptions} [sequelizeOptions]
   * @memberof SqlBlobMetadataStore
   */
  public constructor(
    connectionURI: string,
    sequelizeOptions?: SequelizeOptions,
    private readonly clearDB: boolean = false
  ) {
    // Enable encrypt connection for SQL Server
    if (connectionURI.startsWith("mssql") && sequelizeOptions) {
      sequelizeOptions.dialectOptions = sequelizeOptions.dialectOptions || {};
      (sequelizeOptions.dialectOptions as any).options =
        (sequelizeOptions.dialectOptions as any).options || {};
      (sequelizeOptions.dialectOptions as any).options.encrypt = true;
    }
    this.isPostgres = connectionURI.startsWith("postgres");
    this.sequelize = new Sequelize(connectionURI, sequelizeOptions);
  }

  public async init(): Promise<void> {
    await this.sequelize.authenticate();

    ServicesModel.init(
      {
        accountName: {
          type: "VARCHAR(255)",
          primaryKey: true
        },
        defaultServiceVersion: {
          type: "VARCHAR(10)"
        },
        cors: {
          type: "VARCHAR(4095)"
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
          type: "VARCHAR(1023)"
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

    ContainersModel.init(
      {
        accountName: {
          type: "VARCHAR(255)",
          unique: "accountname_containername"
        },
        // tslint:disable-next-line:max-line-length
        // https://docs.microsoft.com/en-us/rest/api/storageservices/naming-and-referencing-containers--blobs--and-metadata
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
        // TODO: Confirm max length of metadata pairs
        metadata: {
          type: "VARCHAR(4095)"
        },
        properties: {
          type: "VARCHAR(4095)"
        },
        containerAcl: {
          type: "VARCHAR(1023)"
        },
        publicAccess: {
          type: "VARCHAR(31)"
        },
        lease: {
          type: "VARCHAR(1023)"
        },
        hasImmutabilityPolicy: {
          type: BOOLEAN
        },
        hasLegalHold: {
          type: BOOLEAN
        }
      },
      {
        sequelize: this.sequelize,
        modelName: "Containers",
        tableName: "Containers",
        charset: DEFAULT_SQL_CHARSET,
        collate: DEFAULT_SQL_COLLATE,
        timestamps: false
      }
    );

    const blobIndexes: ModelIndexesOptions[] = this.isPostgres
      ? [
          {
            unique: true,
            fields: ["accountName", "containerName", "blobName", "snapshot"]
          }
        ]
      : [
          {
            unique: false,
            fields: ["accountName", "containerName"]
          }
        ];

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
        blobName: {
          type: this.isPostgres ? "VARCHAR(65535)" : TEXT("medium"),
          allowNull: false
        },
        snapshot: {
          type: "VARCHAR(64)",
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
        creationTime: {
          allowNull: false,
          type: DATE(6)
        },
        committedBlocksInOrder: {
          type: this.isPostgres ? "VARCHAR(65535)" : TEXT("medium"),
          allowNull: true
        },
        isCommitted: {
          type: BOOLEAN,
          allowNull: false
        },
        isDirectory: {
          type: BOOLEAN,
          allowNull: false
        },
        permissions: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        acl: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        owner: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        group: {
          type: "VARCHAR(255)",
          allowNull: false
        },
        properties: {
          type: this.isPostgres ? "VARCHAR(65535)" : TEXT("medium"),
          allowNull: false
        },
        leaseBreakTime: {
          allowNull: true,
          type: DATE(6)
        },
        leaseDurationSeconds: {
          allowNull: true,
          type: INTEGER.UNSIGNED
        },
        leaseExpireTime: {
          allowNull: true,
          type: DATE(6)
        },
        leaseId: {
          type: "VARCHAR(255)",
          allowNull: true
        },
        metadata: {
          type: "VARCHAR(2047)",
          allowNull: true
        },
        //objectReplicationMetadata
        //pageRangesInOrder
        persistency: {
          type: "VARCHAR(255)"
        },
        versionId: {
          type: "VARCHAR(64)",
          allowNull: true
        }
      },
      {
        sequelize: this.sequelize,
        modelName: "Blobs",
        tableName: "Blobs",
        timestamps: false,
        charset: DEFAULT_SQL_CHARSET,
        collate: DEFAULT_SQL_COLLATE,
        indexes: blobIndexes
      }
    );

    const blockIndexes: ModelIndexesOptions[] = this.isPostgres
      ? [
          {
            unique: true,
            fields: ["accountName", "containerName", "blobName", "blockName"]
          }
        ]
      : [
          {
            unique: false,
            fields: ["accountName", "containerName"]
          }
        ];

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
          type: this.isPostgres ? "VARCHAR(65535)" : TEXT("medium"),
          allowNull: false
        },
        // TODO: Check max block name length
        blockName: {
          type: this.isPostgres ? "VARCHAR(65535)" : TEXT("medium"),
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
        indexes: blockIndexes
      }
    );

    if (this.clearDB) {
      await this.sequelize.sync({ force: true });
    } else {
      // TODO: sync() is only for development purpose, use migration for production
      await this.sequelize.sync();
    }

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

  public async clean(): Promise<void> {
    // TODO: Implement cleanup in database
  }

  public async setServiceProperties(
    context: Context,
    serviceProperties: ServicePropertiesModel
  ): Promise<ServicePropertiesModel> {
    return await this.sequelize.transaction(async (t) => {
      const findResult = await ServicesModel.findByPk(
        serviceProperties.accountName,
        {
          transaction: t
        }
      );
      const updateValues = {
        defaultServiceVersion: serviceProperties.defaultServiceVersion,
        cors: this.serializeModelValue(serviceProperties.cors),
        logging: this.serializeModelValue(serviceProperties.logging),
        minuteMetrics: this.serializeModelValue(
          serviceProperties.minuteMetrics
        ),
        hourMetrics: this.serializeModelValue(serviceProperties.hourMetrics),
        staticWebsite: this.serializeModelValue(
          serviceProperties.staticWebsite
        ),
        deleteRetentionPolicy: this.serializeModelValue(
          serviceProperties.deleteRetentionPolicy
        )
      };
      if (findResult === null) {
        await ServicesModel.create(
          {
            accountName: serviceProperties.accountName,
            ...updateValues
          },
          { transaction: t }
        );
      } else {
        const updateResult = await ServicesModel.update(updateValues, {
          transaction: t,
          where: {
            accountName: serviceProperties.accountName
          }
        });

        // Set the exactly equal properties will affect 0 rows.
        const updatedRows = updateResult[0];
        if (updatedRows > 1) {
          throw Error(
            `SqlBlobMetadataStore:updateServiceProperties() failed. Update operation affect ${updatedRows} rows.`
          );
        }
      }

      return serviceProperties;
    });
  }

  public async getServiceProperties(
    context: Context,
    account: string
  ): Promise<ServicePropertiesModel | undefined> {
    const findResult = await ServicesModel.findByPk(account);
    if (findResult === null) {
      return undefined;
    }

    const logging = this.deserializeModelValue<Models.Logging>(
      findResult,
      "logging"
    );
    const hourMetrics = this.deserializeModelValue<Models.Metrics>(
      findResult,
      "hourMetrics"
    );
    const minuteMetrics = this.deserializeModelValue<Models.Metrics>(
      findResult,
      "minuteMetrics"
    );
    const cors = this.deserializeModelValue<Models.CorsRule[]>(
      findResult,
      "cors"
    );
    const deleteRetentionPolicy =
      this.deserializeModelValue<Models.RetentionPolicy>(
        findResult,
        "deleteRetentionPolicy"
      );
    const staticWebsite = this.deserializeModelValue<Models.StaticWebsite>(
      findResult,
      "staticWebsite"
    );
    const defaultServiceVersion = this.getModelValue<string>(
      findResult,
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
  }

  public async listContainers(
    context: Context,
    account: string,
    prefix: string = "",
    maxResults: number = DEFAULT_LIST_CONTAINERS_MAX_RESULTS,
    marker: string
  ): Promise<[ContainerModel[], string | undefined]> {
    const whereQuery: any = { accountName: account };

    if (prefix.length > 0) {
      whereQuery.containerName = {
        [Op.like]: `${prefix}%`
      };
    }

    if (marker !== "") {
      if (whereQuery.containerName === undefined) {
        whereQuery.containerName = {
          [Op.gt]: marker
        };
      } else {
        whereQuery.containerName[Op.gt] = marker;
      }
    }

    const findResult = await ContainersModel.findAll({
      limit: maxResults + 1,
      where: whereQuery as any,
      order: [["containerName", "ASC"]]
    });

    const leaseUpdateMapper = (model: ContainersModel) => {
      const containerModel = this.convertDbModelToContainerModel(model);
      return LeaseFactory.createLeaseState(
        new ContainerLeaseAdapter(containerModel),
        context
      ).sync(new ContainerLeaseSyncer(containerModel));
    };

    if (findResult.length <= maxResults) {
      return [findResult.map(leaseUpdateMapper), undefined];
    } else {
      const tail = findResult[findResult.length - 2];
      findResult.pop();
      const nextMarker = this.getModelValue<string>(
        tail,
        "containerName",
        true
      );
      return [findResult.map(leaseUpdateMapper), nextMarker];
    }
  }

  public async createContainer(
    context: Context,
    container: ContainerModel
  ): Promise<ContainerModel> {
    try {
      await ContainersModel.create(
        this.convertContainerModelToDbModel(container)
      );
      return container;
    } catch (err) {
      if (err.name === "SequelizeUniqueConstraintError") {
        throw StorageErrorFactory.getContainerAlreadyExists(context);
      }
      throw err;
    }
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

  public async getContainerProperties(
    context: Context,
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<ContainerModel> {
    const findResult = await this.assertContainerExists(
      context,
      account,
      container,
      undefined,
      true
    );
    const containerModel = this.convertDbModelToContainerModel(findResult);

    return LeaseFactory.createLeaseState(
      new ContainerLeaseAdapter(containerModel),
      context
    )
      .validate(new ContainerReadLeaseValidator(leaseAccessConditions))
      .sync(new ContainerLeaseSyncer(containerModel));
  }

  public async deleteContainer(
    context: Context,
    account: string,
    container: string,
    options: Models.ContainerDeleteMethodOptionalParams = {}
  ): Promise<void> {
    await this.sequelize.transaction(async (t) => {
      /* Transaction starts */
      const findResult = await ContainersModel.findOne({
        attributes: [
          "accountName",
          "containerName",
          "etag",
          "lastModified",
          "lease"
        ],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        findResult ? this.convertDbModelToContainerModel(findResult) : undefined
      );

      if (findResult === null || findResult === undefined) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      LeaseFactory.createLeaseState(
        this.convertDbModelToLease(findResult),
        context
      ).validate(
        new ContainerDeleteLeaseValidator(options.leaseAccessConditions)
      );

      await ContainersModel.destroy({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      await BlobsModel.destroy({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      await BlocksModel.destroy({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });
      /* Transaction ends */
    });
  }

  public async setContainerMetadata(
    context: Context,
    account: string,
    container: string,
    lastModified: Date,
    etag: string,
    metadata?: IContainerMetadata,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<void> {
    return await this.sequelize.transaction(async (t) => {
      /* Transaction starts */
      const findResult = await ContainersModel.findOne({
        attributes: [
          "accountName",
          "containerName",
          "etag",
          "lastModified",
          "lease"
        ],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      validateWriteConditions(
        context,
        modifiedAccessConditions,
        findResult ? this.convertDbModelToContainerModel(findResult) : undefined
      );

      if (findResult === null || findResult === undefined) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      LeaseFactory.createLeaseState(
        this.convertDbModelToLease(findResult),
        context
      ).validate(new ContainerReadLeaseValidator(leaseAccessConditions));

      await ContainersModel.update(
        {
          lastModified,
          etag,
          metadata: this.serializeModelValue(metadata) || null
        },
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );
      /* Transaction ends */
    });
  }

  /**
   * Get container access policy.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} context
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @returns {Promise<GetContainerAccessPolicyResponse>}
   * @memberof LokiBlobMetadataStore
   */
  getContainerACL(
    context: Context,
    account: string,
    container: string,
    forceExist?: true,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<GetContainerAccessPolicyResponse>;

  getContainerACL(
    context: Context,
    account: string,
    container: string,
    forceExist: false,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<GetContainerAccessPolicyResponse | undefined>;

  public async getContainerACL(
    context: Context,
    account: string,
    container: string,
    forceExist?: boolean,
    leaseAccessConditions?: Models.LeaseAccessConditions | undefined
  ): Promise<GetContainerAccessPolicyResponse> {
    const findResult = await ContainersModel.findOne({
      where: {
        accountName: account,
        containerName: container
      }
    });

    if (findResult === null || findResult === undefined) {
      if (forceExist === undefined || forceExist === true) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      throw StorageErrorFactory.getContainerNotFound(context);
    }

    const containerModel = this.convertDbModelToContainerModel(findResult);

    LeaseFactory.createLeaseState(
      new ContainerLeaseAdapter(containerModel),
      context
    )
      .validate(new ContainerReadLeaseValidator(leaseAccessConditions))
      .sync(new ContainerLeaseSyncer(containerModel));

    return {
      properties: containerModel.properties,
      containerAcl: containerModel.containerAcl
    };
  }

  public async setContainerACL(
    context: Context,
    account: string,
    container: string,
    setAclModel: SetContainerAccessPolicyOptions
  ): Promise<void> {
    await this.sequelize.transaction(async (t) => {
      const findResult = await ContainersModel.findOne({
        attributes: [
          "accountName",
          "containerName",
          "etag",
          "lastModified",
          "lease"
        ],
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      validateWriteConditions(
        context,
        setAclModel.modifiedAccessConditions,
        findResult ? this.convertDbModelToContainerModel(findResult) : undefined
      );

      if (findResult === null || findResult === undefined) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      const lease = this.convertDbModelToLease(findResult);

      LeaseFactory.createLeaseState(lease, context).validate(
        new ContainerReadLeaseValidator(setAclModel.leaseAccessConditions)
      );

      const updateResult = await ContainersModel.update(
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
      );

      if (updateResult[0] === 0) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }
    });
  }

  public async acquireContainerLease(
    context: Context,
    account: string,
    container: string,
    options: Models.ContainerAcquireLeaseOptionalParams
  ): Promise<AcquireContainerLeaseResponse> {
    return await this.sequelize.transaction(async (t) => {
      /* Transaction starts */
      const findResult = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        findResult ? this.convertDbModelToContainerModel(findResult) : undefined
      );

      if (findResult === null || findResult === undefined) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      const containerModel = this.convertDbModelToContainerModel(findResult);
      LeaseFactory.createLeaseState(
        new ContainerLeaseAdapter(containerModel),
        context
      )
        .acquire(options.duration!, options.proposedLeaseId)
        .sync(new ContainerLeaseSyncer(containerModel));

      await ContainersModel.update(
        this.convertLeaseToDbModel(new ContainerLeaseAdapter(containerModel)),
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      return {
        properties: containerModel.properties,
        leaseId: containerModel.leaseId
      };
      /* Transaction ends */
    });
  }

  public async releaseContainerLease(
    context: Context,
    account: string,
    container: string,
    leaseId: string,
    options: Models.ContainerReleaseLeaseOptionalParams = {}
  ): Promise<Models.ContainerProperties> {
    return await this.sequelize.transaction(async (t) => {
      /* Transaction starts */
      const findResult = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        findResult ? this.convertDbModelToContainerModel(findResult) : undefined
      );

      if (findResult === null || findResult === undefined) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      const containerModel = this.convertDbModelToContainerModel(findResult);

      LeaseFactory.createLeaseState(
        new ContainerLeaseAdapter(containerModel),
        context
      )
        .release(leaseId)
        .sync(new ContainerLeaseSyncer(containerModel));

      await ContainersModel.update(
        this.convertLeaseToDbModel(new ContainerLeaseAdapter(containerModel)),
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      return containerModel.properties;
      /* Transaction ends */
    });
  }

  public async renewContainerLease(
    context: Context,
    account: string,
    container: string,
    leaseId: string,
    options: Models.ContainerRenewLeaseOptionalParams = {}
  ): Promise<RenewContainerLeaseResponse> {
    return await this.sequelize.transaction(async (t) => {
      /* Transaction starts */
      // TODO: Filter out unnecessary fields in select query
      const findResult = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        findResult ? this.convertDbModelToContainerModel(findResult) : undefined
      );

      if (findResult === null || findResult === undefined) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      const containerModel = this.convertDbModelToContainerModel(findResult);

      LeaseFactory.createLeaseState(
        new ContainerLeaseAdapter(containerModel),
        context
      )
        .renew(leaseId)
        .sync(new ContainerLeaseSyncer(containerModel));

      await ContainersModel.update(
        this.convertLeaseToDbModel(new ContainerLeaseAdapter(containerModel)),
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      return {
        properties: containerModel.properties,
        leaseId: containerModel.leaseId
      };
      /* Transaction ends */
    });
  }

  public async breakContainerLease(
    context: Context,
    account: string,
    container: string,
    breakPeriod: number | undefined,
    options: Models.ContainerBreakLeaseOptionalParams = {}
  ): Promise<BreakContainerLeaseResponse> {
    return await this.sequelize.transaction(async (t) => {
      const findResult = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        findResult ? this.convertDbModelToContainerModel(findResult) : undefined
      );

      if (findResult === null || findResult === undefined) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      const containerModel = this.convertDbModelToContainerModel(findResult);

      LeaseFactory.createLeaseState(
        new ContainerLeaseAdapter(containerModel),
        context
      )
        .break(breakPeriod)
        .sync(new ContainerLeaseSyncer(containerModel));

      await ContainersModel.update(
        this.convertLeaseToDbModel(new ContainerLeaseAdapter(containerModel)),
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      const leaseTimeSeconds: number =
        containerModel.properties.leaseState ===
          Models.LeaseStateType.Breaking && containerModel.leaseBreakTime
          ? Math.round(
              (containerModel.leaseBreakTime.getTime() -
                context.startTime!.getTime()) /
                1000
            )
          : 0;

      return {
        properties: containerModel.properties,
        leaseTime: leaseTimeSeconds
      };
    });
  }

  public async changeContainerLease(
    context: Context,
    account: string,
    container: string,
    leaseId: string,
    proposedLeaseId: string,
    options: Models.ContainerChangeLeaseOptionalParams = {}
  ): Promise<ChangeContainerLeaseResponse> {
    return await this.sequelize.transaction(async (t) => {
      const findResult = await ContainersModel.findOne({
        where: {
          accountName: account,
          containerName: container
        },
        transaction: t
      });

      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        findResult ? this.convertDbModelToContainerModel(findResult) : undefined
      );

      if (findResult === null || findResult === undefined) {
        throw StorageErrorFactory.getContainerNotFound(context);
      }

      const containerModel = this.convertDbModelToContainerModel(findResult);

      LeaseFactory.createLeaseState(
        new ContainerLeaseAdapter(containerModel),
        context
      )
        .change(leaseId, proposedLeaseId)
        .sync(new ContainerLeaseSyncer(containerModel));

      await ContainersModel.update(
        this.convertLeaseToDbModel(new ContainerLeaseAdapter(containerModel)),
        {
          where: {
            accountName: account,
            containerName: container
          },
          transaction: t
        }
      );

      return {
        properties: containerModel.properties,
        leaseId: containerModel.leaseId
      };
    });
  }

  public async checkContainerExist(
    context: Context,
    account: string,
    container: string
  ): Promise<void> {
    await this.assertContainerExists(context, account, container, undefined);
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
        permissions: toPermissionsString(blob.permissions)
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

      await BlobsModel.destroy({
        where: {
          accountName: account,
          containerName: container,
          blobName: directory,
          isDirectory: true
        },
        transaction: t
      });
    });
  }

  /**
   * Create blob item in persistency layer. Will replace if blob exists.
   *
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Models.ModifiedAccessConditions} [modifiedAccessConditions]
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async createBlob(
    context: Context,
    blob: BlobModel,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<void> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(
        context,
        blob.accountName,
        blob.containerName,
        t
      );

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

      const blobModel = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult)
        : undefined;

      await this.validateExpireConditions(context, blobModel, t);
      validateWriteConditions(context, modifiedAccessConditions, blobModel);

      // Create if not exists
      if (
        modifiedAccessConditions &&
        modifiedAccessConditions.ifNoneMatch === "*" &&
        blobFindResult
      ) {
        throw StorageErrorFactory.getBlobAlreadyExists(context);
      }

      if (blobModel) {
        LeaseFactory.createLeaseState(new BlobLeaseAdapter(blobModel), context)
          .validate(new BlobWriteLeaseValidator(leaseAccessConditions))
          .sync(new BlobLeaseSyncer(blob)); // Keep original blob lease;

        if (
          blobModel.properties !== undefined &&
          blobModel.properties.accessTier === Models.AccessTier.Archive
        ) {
          throw StorageErrorFactory.getBlobArchived(context);
        }
      }

      await this.upsertBlob(blob, t);
    });
  }

  public async downloadBlob(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<BlobModel> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot,
          isCommitted: true
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult)
        : undefined;

      await this.validateExpireConditions(context, blobModel, t, true);
      validateReadConditions(context, modifiedAccessConditions, blobModel);

      if (blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      return LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobModel),
        context
      )
        .validate(new BlobReadLeaseValidator(leaseAccessConditions))
        .sync(new BlobLeaseSyncer(blobModel));
    });
  }

  public async listBlobs(
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
    return this.list(
      false,
      context,
      account,
      container,
      delimiter,
      blob,
      prefix,
      maxResults,
      marker,
      includeSnapshots,
      includeUncommittedBlobs
    );
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
      const filteredModels = blobModels.filter(
        async (blobModel) =>
          await this.validateExpireConditions(context, blobModel, t, false)
      );
      return [filteredModels, blobPrefixes, nextMarker];
    });
  }

  public async listAllBlobs(
    maxResults: number = DEFAULT_LIST_BLOBS_MAX_RESULTS,
    marker?: string,
    includeSnapshots?: boolean,
    includeUncommittedBlobs?: boolean
  ): Promise<[BlobModel[], any | undefined]> {
    const whereQuery: any = {};
    if (marker !== undefined) {
      whereQuery.blobName = {
        [Op.gt]: marker
      };
    }
    if (!includeSnapshots) {
      whereQuery.snapshot = "";
    }
    if (!includeUncommittedBlobs) {
      whereQuery.isCommitted = true;
    }

    const blobFindResult = await BlobsModel.findAll({
      limit: maxResults + 1,
      where: whereQuery as any,
      order: [["blobName", "ASC"]]
    });

    const blobModels = blobFindResult
      .map(this.convertDbModelToBlobModel.bind(this))
      .filter(
        async (model) =>
          await this.validateExpireConditions(
            undefined,
            model,
            undefined,
            false
          )
      );
    if (blobModels.length <= maxResults) {
      return [blobModels, undefined];
    } else {
      blobModels.pop();
      const tail = blobModels[blobModels.length - 1];
      const nextMarker = tail.name;
      return [blobModels, nextMarker];
    }
  }

  public async stageBlock(
    context: Context,
    block: BlockModel,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    append: boolean = false
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
      const valid = await this.validateExpireConditions(
        context,
        blobModel,
        t,
        false
      );
      if (blobModel !== undefined && valid) {
        if (blobModel.isCommitted === true) {
          LeaseFactory.createLeaseState(
            new BlobLeaseAdapter(blobModel),
            context
          ).validate(new BlobWriteLeaseValidator(leaseAccessConditions));
        }

        if (!append) {
          // If the new block ID does not have same length with before uncommited block ID, return failure.
          const existBlock = await BlocksModel.findOne({
            attributes: ["blockName"],
            where: {
              accountName: block.accountName,
              containerName: block.containerName,
              blobName: block.blobName
            },
            order: [["id", "ASC"]],
            transaction: t
          });
          if (
            existBlock &&
            Buffer.from(
              this.getModelValue<string>(existBlock, "blockName", true),
              "base64"
            ).length !== Buffer.from(block.name, "base64").length
          ) {
            throw StorageErrorFactory.getInvalidBlobOrBlock(context);
          }
        }
      } else {
        const newBlob: BlobModel = {
          deleted: false,
          accountName: block.accountName,
          containerName: block.containerName,
          name: block.blobName,
          properties: {
            creationTime: context.startTime!,
            lastModified: context.startTime!,
            etag: newEtag(),
            contentLength: 0,
            blobType: Models.BlobType.BlockBlob
          },
          snapshot: "",
          isCommitted: false,
          isDirectory: false,
          permissions: toPermissions(DEFAULT_FILE_PERMISSIONS)!,
          acl: [],
          owner: DEFAULT_OWNER,
          group: DEFAULT_GROUP
        };
        await this.upsertBlob(newBlob, t);
      }

      await this.upsertBlock(block, t);
    });
  }

  public async getBlockList(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    isCommitted?: boolean,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<any> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot
        },
        transaction: t
      });

      if (blobFindResult === null || blobFindResult === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      const blobModel = this.convertDbModelToBlobModel(blobFindResult);
      await this.validateExpireConditions(context, blobModel, t, true);

      LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobModel),
        context
      ).validate(new BlobReadLeaseValidator(leaseAccessConditions));

      const res: {
        uncommittedBlocks: Models.Block[];
        committedBlocks: Models.Block[];
      } = {
        uncommittedBlocks: [],
        committedBlocks: []
      };

      if (isCommitted !== false) {
        res.committedBlocks = blobModel.committedBlocksInOrder || [];
      }

      if (isCommitted !== true) {
        const blocks = await BlocksModel.findAll({
          attributes: ["blockName", "size"],
          where: {
            accountName: account,
            containerName: container,
            blobName: blob
          },
          order: [["id", "ASC"]],
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
      return res;
    });
  }

  public async commitBlockList(
    context: Context,
    blob: BlobModel,
    blockList: { blockName: string; blockCommitType: string }[],
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

      const pCommittedBlocksMap: Map<string, PersistencyBlockModel> = new Map(); // persistencyCommittedBlocksMap
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
      const valid = await this.validateExpireConditions(
        context,
        blobModel,
        t,
        false
      );
      validateWriteConditions(
        context,
        modifiedAccessConditions,
        valid ? blobModel : undefined
      );

      let creationTime = blob.properties.creationTime || context.startTime;

      if (blobModel !== undefined && valid) {
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

        const committedBlocksInOrder = blobModel.committedBlocksInOrder;
        for (const pBlock of committedBlocksInOrder || []) {
          pCommittedBlocksMap.set(pBlock.name, pBlock);
        }
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
          persistency: this.deserializeModelValue<IExtentChunk>(
            item,
            "persistency",
            true
          )
        };
        pUncommittedBlocksMap.set(block.name, block);
      }

      const selectedBlockList: PersistencyBlockModel[] =
        blobModel &&
        blobModel.properties.blobType === Models.BlobType.AppendBlob &&
        blobModel.committedBlocksInOrder
          ? blobModel.committedBlocksInOrder
          : [];
      for (const block of blockList) {
        switch (block.blockCommitType.toLowerCase()) {
          case "uncommitted":
            const pUncommittedBlock = pUncommittedBlocksMap.get(
              block.blockName
            );
            if (pUncommittedBlock === undefined) {
              throw badRequestError;
            } else {
              selectedBlockList.push(pUncommittedBlock);
            }
            break;
          case "committed":
            const pCommittedBlock = pCommittedBlocksMap.get(block.blockName);
            if (pCommittedBlock === undefined) {
              throw badRequestError;
            } else {
              selectedBlockList.push(pCommittedBlock);
            }
            break;
          case "latest":
            const pLatestBlock =
              pUncommittedBlocksMap.get(block.blockName) ||
              pCommittedBlocksMap.get(block.blockName);
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

      await this.upsertBlob(commitBlockBlob, t);

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

  public async getBlobProperties(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<GetBlobPropertiesRes> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot,
          isCommitted: true
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult)
        : undefined;

      await this.validateExpireConditions(context, blobModel, t, true);
      validateReadConditions(context, modifiedAccessConditions, blobModel);

      if (blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      if (!blobModel.isCommitted) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      // TODO: Return blobCommittedBlockCount for append blob

      return LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobModel),
        context
      )
        .validate(new BlobReadLeaseValidator(leaseAccessConditions))
        .sync(new BlobLeaseSyncer(blobModel));
    });
  }

  public async createSnapshot(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    metadata?: Models.BlobMetadata,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<CreateSnapshotResponse> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          isCommitted: true
        },
        transaction: t
      });

      const snapshotBlob: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult) // TODO: Reduce double convert
        : undefined;
      await this.validateExpireConditions(context, snapshotBlob, t, true);
      validateReadConditions(context, modifiedAccessConditions, snapshotBlob);

      if (snapshotBlob === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(snapshotBlob),
        context
      ).validate(new BlobReadLeaseValidator(leaseAccessConditions));

      const snapshotTime = convertDateTimeStringMsTo7Digital(
        context.startTime!.toISOString()
      );

      snapshotBlob.snapshot = snapshotTime;
      snapshotBlob.metadata = metadata || snapshotBlob.metadata;

      new BlobLeaseSyncer(snapshotBlob).sync({
        leaseId: undefined,
        leaseExpireTime: undefined,
        leaseDurationSeconds: undefined,
        leaseBreakTime: undefined,
        leaseDurationType: undefined,
        leaseState: undefined,
        leaseStatus: undefined
      });

      await this.upsertBlob(snapshotBlob, t);

      return {
        properties: snapshotBlob.properties,
        snapshot: snapshotTime
      };
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

      await BlobsModel.destroy({
        where: {
          accountName: account,
          containerName: sourceContainer,
          blobName: sourceBlob
        },
        transaction: t
      });

      return model;
    });
  }

  /**
   * Delete blob or its snapshots.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.PathDeleteMethodOptionalParams} options
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async deleteBlob(
    context: Context,
    account: string,
    container: string,
    blob: string,
    options: Models.PathDeleteMethodOptionalParams
  ): Promise<void> {
    await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: options.snapshot === undefined ? "" : options.snapshot,
          isCommitted: true // TODO: Support deleting uncommitted block blob
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult)
        : undefined;
      await this.validateExpireConditions(context, blobModel, t, true);
      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        blobModel
      );
      if (blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      const againstBaseBlob = blobModel.snapshot === "";

      if (againstBaseBlob) {
        LeaseFactory.createLeaseState(
          new BlobLeaseAdapter(blobModel),
          context
        ).validate(new BlobWriteLeaseValidator(options.leaseAccessConditions));
      }

      // Check bad requests
      if (!againstBaseBlob && options.deleteSnapshots !== undefined) {
        throw StorageErrorFactory.getInvalidOperation(
          context,
          "Invalid operation against a blob snapshot."
        );
      }

      // Scenario: Delete base blob only
      if (againstBaseBlob && options.deleteSnapshots === undefined) {
        const count = await BlobsModel.count({
          where: {
            accountName: account,
            containerName: container,
            blobName: blob
          },
          transaction: t
        });

        if (count > 1) {
          throw StorageErrorFactory.getSnapshotsPresent(context);
        } else {
          await BlobsModel.destroy({
            where: {
              accountName: account,
              containerName: container,
              blobName: blob
            },
            transaction: t
          });

          await BlocksModel.destroy({
            where: {
              accountName: account,
              containerName: container,
              blobName: blob
            },
            transaction: t
          });
        }
      }

      // Scenario: Delete one snapshot only
      if (!againstBaseBlob) {
        await BlobsModel.destroy({
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: blobModel.snapshot
          },
          transaction: t
        });
      }

      // Scenario: Delete base blob and snapshots
      if (
        againstBaseBlob &&
        options.deleteSnapshots === Models.DeleteSnapshotsOptionType.Include
      ) {
        await BlobsModel.destroy({
          where: {
            accountName: account,
            containerName: container,
            blobName: blob
          },
          transaction: t
        });

        await BlocksModel.destroy({
          where: {
            accountName: account,
            containerName: container,
            blobName: blob
          },
          transaction: t
        });
      }

      // Scenario: Delete all snapshots only
      if (
        againstBaseBlob &&
        options.deleteSnapshots === Models.DeleteSnapshotsOptionType.Only
      ) {
        await BlobsModel.destroy({
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: { [Op.gt]: "" }
          },
          transaction: t
        });
      }
    });
  }

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
   * @returns {Promise<Models.BlobPropertiesInternal>}
   * @memberof LokiBlobMetadataStore
   */
  public async setBlobHTTPHeaders(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    blobHTTPHeaders: Models.BlobHTTPHeaders | undefined,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<Models.BlobPropertiesInternal> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          isCommitted: true
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult) // TODO: Reduce double convert
        : undefined;
      await this.validateExpireConditions(context, blobModel, t, true);
      validateWriteConditions(context, modifiedAccessConditions, blobModel);

      if (blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      LeaseFactory.createLeaseState(new BlobLeaseAdapter(blobModel), context)
        .validate(new BlobWriteLeaseValidator(leaseAccessConditions))
        .sync(new BlobWriteLeaseSyncer(blobModel));

      if (blobHTTPHeaders !== undefined) {
        blobModel.properties.cacheControl = blobHTTPHeaders.blobCacheControl;
        blobModel.properties.contentType = blobHTTPHeaders.blobContentType;
        blobModel.properties.contentMD5 = blobHTTPHeaders.blobContentMD5;
        blobModel.properties.contentEncoding =
          blobHTTPHeaders.blobContentEncoding;
        blobModel.properties.contentLanguage =
          blobHTTPHeaders.blobContentLanguage;
        blobModel.properties.contentDisposition =
          blobHTTPHeaders.blobContentDisposition;
      }

      blobModel.properties.etag = newEtag();
      blobModel.properties.lastModified = context.startTime
        ? context.startTime
        : new Date();

      await BlobsModel.update(this.convertBlobModelToDbModel(blobModel), {
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: ""
        },
        transaction: t
      });

      return blobModel.properties;
    });
  }

  public async setBlobMetadata(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    metadata: Models.BlobMetadata | undefined,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<Models.BlobPropertiesInternal> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          isCommitted: true
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult) // TODO: Reduce double convert
        : undefined;
      await this.validateExpireConditions(context, blobModel, t, true);
      validateWriteConditions(context, modifiedAccessConditions, blobModel);

      if (blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      LeaseFactory.createLeaseState(new BlobLeaseAdapter(blobModel), context)
        .validate(new BlobWriteLeaseValidator(leaseAccessConditions))
        .sync(new BlobWriteLeaseSyncer(blobModel));

      const lastModified = context.startTime! || new Date();
      const etag = newEtag();

      await BlobsModel.update(
        {
          metadata: this.serializeModelValue(metadata) || null,
          lastModified,
          etag,
          ...this.convertLeaseToDbModel(new BlobLeaseAdapter(blobModel))
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: ""
          },
          transaction: t
        }
      );

      const ret: Models.BlobPropertiesInternal = {
        lastModified,
        etag,
        leaseStatus: blobModel.properties.leaseStatus,
        leaseDuration: blobModel.properties.leaseDuration,
        leaseState: blobModel.properties.leaseState
      };

      return ret;
    });
  }

  public async acquireBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    duration: number,
    proposedLeaseId?: string,
    options: Models.BlobAcquireLeaseOptionalParams = {}
  ): Promise<AcquireBlobLeaseResponse> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobModel = await this.getBlobWithLeaseUpdated(
        account,
        container,
        blob,
        undefined,
        context,
        false,
        false,
        t
      );

      await this.validateExpireConditions(context, blobModel, t, true);
      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        blobModel
      );

      if (blobModel === null || blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      if (blobModel.snapshot !== "") {
        throw StorageErrorFactory.getBlobSnapshotsPresent(context);
      }

      const lease = LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobModel),
        context
      ).acquire(duration, proposedLeaseId).lease;

      await BlobsModel.update(
        this.convertLeaseToDbBlobsModel(blobModel.properties, lease),
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: ""
          },
          transaction: t
        }
      );
      return { properties: blobModel.properties, leaseId: lease.leaseId };
    });
  }

  public async releaseBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    options: Models.BlobReleaseLeaseOptionalParams = {}
  ): Promise<ReleaseBlobLeaseResponse> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          isCommitted: true
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult) // TODO: Reduce double convert
        : undefined;
      await this.validateExpireConditions(context, blobModel, t, true);
      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        blobModel
      );

      if (blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      const lease = LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobModel),
        context
      ).release(leaseId).lease;

      await BlobsModel.update(
        this.convertLeaseToDbBlobsModel(blobModel.properties, lease),
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: ""
          },
          transaction: t
        }
      );
      return blobModel.properties;
    });
  }

  public async renewBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    options: Models.BlobRenewLeaseOptionalParams = {}
  ): Promise<RenewBlobLeaseResponse> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          isCommitted: true
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult) // TODO: Reduce double convert
        : undefined;
      await this.validateExpireConditions(context, blobModel, t, true);
      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        blobModel
      );

      if (blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      const lease = LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobModel),
        context
      ).renew(leaseId).lease;

      await BlobsModel.update(
        this.convertLeaseToDbBlobsModel(blobModel.properties, lease),
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: ""
          },
          transaction: t
        }
      );
      return { properties: blobModel.properties, leaseId: lease.leaseId };
    });
  }

  public async changeBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    proposedLeaseId: string,
    options:
      | Models.BlobChangeLeaseOptionalParams
      | Models.PathLeaseOptionalParams = {}
  ): Promise<ChangeBlobLeaseResponse> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          isCommitted: true
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult) // TODO: Reduce double convert
        : undefined;
      await this.validateExpireConditions(context, blobModel, t, true);
      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        blobModel
      );

      if (blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      const lease = LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobModel),
        context
      ).change(leaseId, proposedLeaseId).lease;

      await BlobsModel.update(
        this.convertLeaseToDbBlobsModel(blobModel.properties, lease),
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: ""
          },
          transaction: t
        }
      );
      return { properties: blobModel.properties, leaseId: lease.leaseId };
    });
  }

  public async breakBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    breakPeriod: number | undefined,
    options:
      | Models.BlobBreakLeaseOptionalParams
      | Models.PathLeaseOptionalParams = {}
  ): Promise<BreakBlobLeaseResponse> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          isCommitted: true
        },
        transaction: t
      });

      const blobModel: BlobModel | undefined = blobFindResult
        ? this.convertDbModelToBlobModel(blobFindResult) // TODO: Reduce double convert
        : undefined;
      await this.validateExpireConditions(context, blobModel, t, true);
      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        blobModel
      );

      if (blobModel === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      const lease = LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobModel),
        context
      ).break(breakPeriod).lease;

      const leaseTimeSeconds: number =
        lease.leaseState === Models.LeaseStateType.Breaking &&
        lease.leaseBreakTime
          ? Math.round(
              (lease.leaseBreakTime.getTime() - context.startTime!.getTime()) /
                1000
            )
          : 0;

      await BlobsModel.update(
        this.convertLeaseToDbBlobsModel(blobModel.properties, lease),
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: ""
          },
          transaction: t
        }
      );
      return { properties: blobModel.properties, leaseTime: leaseTimeSeconds };
    });
  }

  public async checkBlobExist(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<void> {
    await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const res = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: snapshot ? snapshot : ""
        },
        transaction: t
      });

      if (res === null || res === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      const blobModel: BlobModel = this.convertDbModelToBlobModel(res);
      await this.validateExpireConditions(context, blobModel, t, true);
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
        snapshot: snapshot ? snapshot : ""
      }
    });

    if (res === null || res === undefined) {
      return undefined;
    }

    const blobModel: BlobModel = this.convertDbModelToBlobModel(res);
    const valid = await this.validateExpireConditions(
      undefined,
      blobModel,
      undefined,
      false
    );

    if (!valid) return undefined;

    const properties =
      this.deserializeModelValue<Models.BlobPropertiesInternal>(
        res,
        "properties",
        true
      );
    const blobType = properties.blobType;
    const isCommitted = this.getModelValue<boolean>(res, "isCommitted", true);

    return { blobType, isCommitted };
  }

  public async startCopyFromURL(
    context: Context,
    source: BlobId,
    destination: BlobId,
    copySource: string,
    metadata: Models.BlobMetadata | undefined,
    tier: Models.AccessTier | undefined,
    options: Models.BlobStartCopyFromURLOptionalParams = {}
  ): Promise<Models.BlobPropertiesInternal> {
    return await this.sequelize.transaction(async (t) => {
      const sourceBlob = await this.getBlobWithLeaseUpdated(
        source.account,
        source.container,
        source.blob,
        source.snapshot,
        context,
        true,
        true,
        t
      );

      await this.validateExpireConditions(context, sourceBlob, t, true);
      options.sourceModifiedAccessConditions =
        options.sourceModifiedAccessConditions || {};
      validateReadConditions(
        context,
        {
          ifModifiedSince:
            options.sourceModifiedAccessConditions.sourceIfModifiedSince,
          ifUnmodifiedSince:
            options.sourceModifiedAccessConditions.sourceIfUnmodifiedSince,
          ifMatch: options.sourceModifiedAccessConditions.sourceIfMatch,
          ifNoneMatch: options.sourceModifiedAccessConditions.sourceIfNoneMatch
        },
        sourceBlob
      );

      const destBlob = await this.getBlobWithLeaseUpdated(
        destination.account,
        destination.container,
        destination.blob,
        undefined,
        context,
        false,
        undefined,
        t
      );

      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        destBlob
      );

      if (destBlob) {
        new BlobWriteLeaseValidator(options.leaseAccessConditions).validate(
          new BlobLeaseAdapter(destBlob),
          context
        );
      }

      // Copy if not exists
      if (
        options.modifiedAccessConditions &&
        options.modifiedAccessConditions.ifNoneMatch === "*" &&
        destBlob
      ) {
        throw StorageErrorFactory.getBlobAlreadyExists(context);
      }

      // If source is uncommitted or deleted
      if (
        sourceBlob === undefined ||
        sourceBlob.deleted ||
        !sourceBlob.isCommitted
      ) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      if (
        sourceBlob.properties.accessTier === Models.AccessTier.Archive &&
        (tier === undefined || source.account !== destination.account)
      ) {
        throw StorageErrorFactory.getBlobArchived(context);
      }

      await this.assertContainerExists(
        context,
        destination.account,
        destination.container,
        t
      );

      // Deep clone a copied blob
      const copiedBlob: BlobModel = {
        name: destination.blob,
        deleted: false,
        snapshot: "",
        properties: {
          ...sourceBlob.properties,
          creationTime: context.startTime!,
          lastModified: context.startTime!,
          etag: newEtag(),
          leaseStatus:
            destBlob !== undefined
              ? destBlob.properties.leaseStatus
              : Models.LeaseStatusType.Unlocked,
          leaseState:
            destBlob !== undefined
              ? destBlob.properties.leaseState
              : Models.LeaseStateType.Available,
          leaseDuration:
            destBlob !== undefined
              ? destBlob.properties.leaseDuration
              : undefined,
          copyId: uuid(),
          copyStatus: Models.CopyStatusType.Success,
          copySource,
          copyProgress: sourceBlob.properties.contentLength
            ? `${sourceBlob.properties.contentLength}/${sourceBlob.properties.contentLength}`
            : undefined,
          copyCompletionTime: context.startTime,
          copyStatusDescription: undefined,
          incrementalCopy: false,
          destinationSnapshot: undefined,
          deletedTime: undefined,
          remainingRetentionDays: undefined,
          archiveStatus: undefined,
          accessTierChangeTime: undefined
        },
        metadata:
          metadata === undefined || Object.keys(metadata).length === 0
            ? { ...sourceBlob.metadata }
            : metadata,
        accountName: destination.account,
        containerName: destination.container,
        pageRangesInOrder: sourceBlob.pageRangesInOrder,
        isCommitted: sourceBlob.isCommitted,
        leaseDurationSeconds:
          destBlob !== undefined ? destBlob.leaseDurationSeconds : undefined,
        leaseId: destBlob !== undefined ? destBlob.leaseId : undefined,
        leaseExpireTime:
          destBlob !== undefined ? destBlob.leaseExpireTime : undefined,
        leaseBreakTime:
          destBlob !== undefined ? destBlob.leaseBreakTime : undefined,
        committedBlocksInOrder: sourceBlob.committedBlocksInOrder,
        persistency: sourceBlob.persistency,
        isDirectory: sourceBlob.isDirectory,
        permissions: sourceBlob.permissions,
        acl: sourceBlob.acl,
        owner: sourceBlob.owner,
        group: sourceBlob.group
      };

      if (
        copiedBlob.properties.blobType === Models.BlobType.BlockBlob &&
        tier !== undefined
      ) {
        copiedBlob.properties.accessTier = this.parseTier(tier);
        if (copiedBlob.properties.accessTier === undefined) {
          throw StorageErrorFactory.getInvalidHeaderValue(context, {
            HeaderName: "x-ms-access-tier",
            HeaderValue: `${tier}`
          });
        }
      }

      if (
        copiedBlob.properties.blobType === Models.BlobType.PageBlob &&
        tier !== undefined
      ) {
        throw StorageErrorFactory.getInvalidHeaderValue(context, {
          HeaderName: "x-ms-access-tier",
          HeaderValue: `${tier}`
        });
      }

      await this.upsertBlob(copiedBlob, t);
      return copiedBlob.properties;
    });
  }

  /**
   * Copy from Url.
   *
   * @param {Context} context
   * @param {BlobId} source
   * @param {BlobId} destination
   * @param {string} copySource
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {(Models.AccessTier | undefined)} tier
   * @param {Models.BlobCopyFromURLOptionalParams} [leaseAccessConditions]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async copyFromURL(
    context: Context,
    source: BlobId,
    destination: BlobId,
    copySource: string,
    metadata: Models.BlobMetadata | undefined,
    tier: Models.AccessTier | undefined,
    options: Models.BlobCopyFromURLOptionalParams = {}
  ): Promise<Models.BlobPropertiesInternal> {
    return await this.sequelize.transaction(async (t) => {
      const sourceBlob = await this.getBlobWithLeaseUpdated(
        source.account,
        source.container,
        source.blob,
        source.snapshot,
        context,
        true,
        true
      );

      await this.validateExpireConditions(context, sourceBlob, t, true);
      options.sourceModifiedAccessConditions =
        options.sourceModifiedAccessConditions || {};
      validateReadConditions(
        context,
        {
          ifModifiedSince:
            options.sourceModifiedAccessConditions.sourceIfModifiedSince,
          ifUnmodifiedSince:
            options.sourceModifiedAccessConditions.sourceIfUnmodifiedSince,
          ifMatch: options.sourceModifiedAccessConditions.sourceIfMatch,
          ifNoneMatch: options.sourceModifiedAccessConditions.sourceIfNoneMatch
        },
        sourceBlob
      );

      const destBlob = await this.getBlobWithLeaseUpdated(
        destination.account,
        destination.container,
        destination.blob,
        undefined,
        context,
        false
      );

      validateWriteConditions(
        context,
        options.modifiedAccessConditions,
        destBlob
      );

      // Copy if not exists
      if (
        options.modifiedAccessConditions &&
        options.modifiedAccessConditions.ifNoneMatch === "*" &&
        destBlob
      ) {
        throw StorageErrorFactory.getBlobAlreadyExists(context);
      }

      if (destBlob) {
        const lease = new BlobLeaseAdapter(destBlob);
        new BlobWriteLeaseSyncer(destBlob).sync(lease);
        new BlobWriteLeaseValidator(options.leaseAccessConditions).validate(
          lease,
          context
        );
      }

      // If source is uncommitted or deleted
      if (
        sourceBlob === undefined ||
        sourceBlob.deleted ||
        !sourceBlob.isCommitted
      ) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      if (sourceBlob.properties.accessTier === Models.AccessTier.Archive) {
        throw StorageErrorFactory.getBlobArchived(context);
      }

      await this.checkContainerExist(
        context,
        destination.account,
        destination.container
      );

      // Deep clone a copied blob
      const copiedBlob: BlobModel = {
        name: destination.blob,
        deleted: false,
        snapshot: "",
        properties: {
          ...sourceBlob.properties,
          creationTime: context.startTime!,
          lastModified: context.startTime!,
          etag: newEtag(),
          leaseStatus:
            destBlob !== undefined
              ? destBlob.properties.leaseStatus
              : Models.LeaseStatusType.Unlocked,
          leaseState:
            destBlob !== undefined
              ? destBlob.properties.leaseState
              : Models.LeaseStateType.Available,
          leaseDuration:
            destBlob !== undefined
              ? destBlob.properties.leaseDuration
              : undefined,
          copyId: uuid(),
          copyStatus: Models.CopyStatusType.Success,
          copySource,
          copyProgress: sourceBlob.properties.contentLength
            ? `${sourceBlob.properties.contentLength}/${sourceBlob.properties.contentLength}`
            : undefined,
          copyCompletionTime: context.startTime,
          copyStatusDescription: undefined,
          incrementalCopy: false,
          destinationSnapshot: undefined,
          deletedTime: undefined,
          remainingRetentionDays: undefined,
          archiveStatus: undefined,
          accessTierChangeTime: undefined
        },
        metadata:
          metadata === undefined || Object.keys(metadata).length === 0
            ? { ...sourceBlob.metadata }
            : metadata,
        accountName: destination.account,
        containerName: destination.container,
        pageRangesInOrder: sourceBlob.pageRangesInOrder,
        isCommitted: sourceBlob.isCommitted,
        leaseDurationSeconds:
          destBlob !== undefined ? destBlob.leaseDurationSeconds : undefined,
        leaseId: destBlob !== undefined ? destBlob.leaseId : undefined,
        leaseExpireTime:
          destBlob !== undefined ? destBlob.leaseExpireTime : undefined,
        leaseBreakTime:
          destBlob !== undefined ? destBlob.leaseBreakTime : undefined,
        committedBlocksInOrder: sourceBlob.committedBlocksInOrder,
        persistency: sourceBlob.persistency,
        isDirectory: sourceBlob.isDirectory,
        permissions: sourceBlob.permissions,
        acl: sourceBlob.acl,
        owner: sourceBlob.owner,
        group: sourceBlob.group
      };

      if (
        copiedBlob.properties.blobType === Models.BlobType.BlockBlob &&
        tier !== undefined
      ) {
        copiedBlob.properties.accessTier = this.parseTier(tier);
        if (copiedBlob.properties.accessTier === undefined) {
          throw StorageErrorFactory.getInvalidHeaderValue(context, {
            HeaderName: "x-ms-access-tier",
            HeaderValue: `${tier}`
          });
        }
      }

      if (
        copiedBlob.properties.blobType === Models.BlobType.PageBlob &&
        tier !== undefined
      ) {
        throw StorageErrorFactory.getInvalidHeaderValue(context, {
          HeaderName: "x-ms-access-tier",
          HeaderValue: `${tier}`
        });
      }

      if (destBlob) {
        await BlobsModel.destroy({
          where: {
            accountName: destBlob.accountName,
            containerName: destBlob.containerName,
            blobName: destBlob.name
          },
          transaction: t
        });
      }

      await this.upsertBlob(copiedBlob, t);
      return copiedBlob.properties;
    });
  }

  public async setTier(
    context: Context,
    account: string,
    container: string,
    blob: string,
    tier: Models.AccessTier,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<200 | 202> {
    return await this.sequelize.transaction(async (t) => {
      await this.assertContainerExists(context, account, container, t);

      const blobFindResult = await BlobsModel.findOne({
        where: {
          accountName: account,
          containerName: container,
          blobName: blob,
          snapshot: "",
          isCommitted: true
        },
        transaction: t
      });

      if (blobFindResult === null || blobFindResult === undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      let responseCode: 200 | 202 = 200;

      // check the lease action aligned with current lease state.
      // the API has not lease ID input, but run it on a lease blocked blob will fail with LeaseIdMissing,
      // this is aligned with server behavior

      const blobModel: BlobModel =
        this.convertDbModelToBlobModel(blobFindResult);

      await this.validateExpireConditions(context, blobModel, t, true);

      LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobModel),
        context
      ).validate(new BlobWriteLeaseValidator(leaseAccessConditions));

      // Check Blob is not snapshot
      const snapshot = blobModel.snapshot;
      if (snapshot !== "") {
        throw StorageErrorFactory.getBlobSnapshotsPresent(context);
      }

      // Check BlobTier matches blob type
      let accessTier = blobModel.properties.accessTier;
      const blobType = blobModel.properties.blobType;
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
        throw StorageErrorFactory.getAccessTierNotSupportedForBlobType(context);
      }

      blobModel.properties.accessTier = accessTier;
      blobModel.properties.accessTierInferred = false;
      blobModel.properties.accessTierChangeTime = context.startTime;
      await BlobsModel.update(
        {
          properties: this.serializeModelValue(blobModel.properties)
        },
        {
          where: {
            accountName: account,
            containerName: container,
            blobName: blob,
            snapshot: ""
          },
          transaction: t
        }
      );

      return responseCode;
    });
  }

  public uploadPages(
    context: Context,
    blob: BlobModel,
    start: number,
    end: number,
    persistency: IExtentChunk,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<Models.BlobPropertiesInternal> {
    throw new NotImplementedError(context);
  }

  public clearRange(
    context: Context,
    blob: BlobModel,
    start: number,
    end: number,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<Models.BlobPropertiesInternal> {
    throw new NotImplementedError(context);
  }

  public getPageRanges(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<GetPageRangeResponse> {
    throw new NotImplementedError(context);
  }

  public resizePageBlob(
    context: Context,
    account: string,
    container: string,
    blob: string,
    blobContentLength: number,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    modifiedAccessConditions?: Models.ModifiedAccessConditions
  ): Promise<Models.BlobPropertiesInternal> {
    throw new NotImplementedError(context);
  }

  public updateSequenceNumber(
    context: Context,
    account: string,
    container: string,
    blob: string,
    sequenceNumberAction: Models.SequenceNumberActionType,
    blobSequenceNumber: number | undefined
  ): Promise<Models.BlobPropertiesInternal> {
    throw new NotImplementedError(context);
  }

  public async appendBlock(
    context: Context,
    block: BlockModel,
    leaseAccessConditions: Models.LeaseAccessConditions = {},
    modifiedAccessConditions: Models.ModifiedAccessConditions = {},
    appendPositionAccessConditions: Models.AppendPositionAccessConditions = {}
  ): Promise<Models.BlobPropertiesInternal> {
    return await this.sequelize.transaction(async (t) => {
      const doc = await this.getBlobWithLeaseUpdated(
        block.accountName,
        block.containerName,
        block.blobName,
        undefined,
        context,
        false,
        true
      );

      await this.validateExpireConditions(context, doc, t, true);
      validateWriteConditions(context, modifiedAccessConditions, doc);

      if (!doc) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      new BlobWriteLeaseValidator(leaseAccessConditions).validate(
        new BlobLeaseAdapter(doc),
        context
      );

      if (doc.properties.blobType !== Models.BlobType.AppendBlob) {
        throw StorageErrorFactory.getBlobInvalidBlobType(context);
      }

      if (
        (doc.committedBlocksInOrder || []).length >= MAX_APPEND_BLOB_BLOCK_COUNT
      ) {
        throw StorageErrorFactory.getBlockCountExceedsLimit(context);
      }

      if (appendPositionAccessConditions.appendPosition !== undefined) {
        if (
          (doc.properties.contentLength || 0) !==
          appendPositionAccessConditions.appendPosition
        ) {
          throw StorageErrorFactory.getAppendPositionConditionNotMet(context);
        }
      }

      if (appendPositionAccessConditions.maxSize !== undefined) {
        if (
          (doc.properties.contentLength || 0) + block.size >
          appendPositionAccessConditions.maxSize
        ) {
          throw StorageErrorFactory.getMaxBlobSizeConditionNotMet(context);
        }
      }

      doc.committedBlocksInOrder = doc.committedBlocksInOrder || [];
      doc.committedBlocksInOrder.push(block);
      doc.properties.etag = newEtag();
      doc.properties.lastModified = context.startTime || new Date();
      doc.properties.contentLength =
        (doc.properties.contentLength || 0) + block.size;

      await this.upsertBlob(doc, t);
      return doc.properties;
    });
  }

  public async listUncommittedBlockPersistencyChunks(
    marker: string = "-1",
    maxResults: number = 2000
  ): Promise<[IExtentChunk[], string | undefined]> {
    return BlocksModel.findAll({
      attributes: ["id", "persistency"],
      where: {
        id: {
          [Op.gt]: parseInt(marker, 10)
        }
      },
      limit: maxResults + 1,
      order: [["id", "ASC"]]
    }).then((res) => {
      if (res.length < maxResults) {
        return [
          res.map((obj) => {
            return this.deserializeModelValue(obj, "persistency", true);
          }),
          undefined
        ];
      } else {
        res.pop();
        const nextMarker = this.getModelValue<string>(
          res[res.length - 1],
          "id",
          true
        );
        return [
          res.map((obj) =>
            this.deserializeModelValue(obj, "persistency", true)
          ),
          nextMarker
        ];
      }
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

      const valid = this.validateExpireConditions(context, doc, t, false);
      if (validateRead) {
        validateReadConditions(context, modifiedAccessConditions, doc);
      }

      if (!doc || !valid) {
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

  public iteratorExtents(): AsyncIterator<string[]> {
    return new BlobReferredExtentsAsyncIterator(this);
  }

  private async assertContainerExists(
    context: Context,
    account: string,
    container: string,
    transaction?: Transaction,
    fullResult: boolean = false
  ): Promise<ContainersModel> {
    const findResult = await ContainersModel.findOne({
      attributes: fullResult ? undefined : ["accountName"],
      where: {
        accountName: account,
        containerName: container
      },
      transaction
    });
    if (findResult === undefined || findResult === null) {
      throw StorageErrorFactory.getContainerNotFound(context);
    }
    return findResult;
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

  private deserializeModelValue<T>(
    model: Model,
    key: string,
    isRequired?: true
  ): T;

  private deserializeModelValue<T>(
    model: Model,
    key: string,
    isRequired: false
  ): T | undefined;

  private deserializeModelValue<T>(
    model: Model,
    key: string,
    isRequired: boolean = false
  ): T | undefined {
    const rawValue = this.getModelValue<string>(model, key);
    if (typeof rawValue === "string") {
      // TODO: Decouple deserializer
      return JSON.parse(rawValue) as T;
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

  private convertDbModelToContainerModel(
    dbModel: ContainersModel
  ): ContainerModel {
    const accountName = this.getModelValue<string>(
      dbModel,
      "accountName",
      true
    );
    const name = this.getModelValue<string>(dbModel, "containerName", true);
    const containerAcl = this.deserializeModelValue<Models.SignedIdentifier[]>(
      dbModel,
      "containerAcl"
    );
    const metadata = this.deserializeModelValue<{
      [propertyName: string]: string;
    }>(dbModel, "metadata");

    const lastModified = this.getModelValue<Date>(
      dbModel,
      "lastModified",
      true
    );
    const etag = this.getModelValue<string>(dbModel, "etag", true);
    const publicAccess = this.deserializeModelValue<Models.PublicAccessType>(
      dbModel,
      "publicAccess"
    );
    const lease = this.convertDbModelToLease(dbModel);
    const leaseBreakTime = lease.leaseBreakTime;
    const leaseExpireTime = lease.leaseExpireTime;
    const leaseId = lease.leaseId;
    const leaseDurationSeconds = lease.leaseDurationSeconds;
    const leaseStatus = lease.leaseStatus;
    const leaseState = lease.leaseState;
    const leaseDuration = lease.leaseDurationType;
    const hasImmutabilityPolicy = this.getModelValue<boolean>(
      dbModel,
      "hasImmutabilityPolicy"
    );
    const hasLegalHold = this.getModelValue<boolean>(dbModel, "hasLegalHold");
    const fileSystemProperties = this.getModelValue<string>(
      dbModel,
      "properties"
    );

    const ret: ContainerModel = {
      accountName,
      name,
      properties: {
        lastModified,
        etag,
        leaseStatus,
        leaseDuration,
        leaseState
      },
      fileSystemProperties,
      leaseId,
      leaseBreakTime,
      leaseExpireTime,
      leaseDurationSeconds
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
  }

  private convertContainerModelToDbModel(container: ContainerModel): object {
    const lease = new ContainerLeaseAdapter(container).toString();
    return {
      accountName: container.accountName,
      containerName: container.name,
      lastModified: container.properties.lastModified,
      properties: container.fileSystemProperties,
      etag: container.properties.etag,
      metadata: this.serializeModelValue(container.metadata),
      containerAcl: this.serializeModelValue(container.containerAcl),
      publicAccess: this.serializeModelValue(container.properties.publicAccess),
      lease,
      hasImmutabilityPolicy: container.properties.hasImmutabilityPolicy,
      hasLegalHold: container.properties.hasLegalHold
    };
  }

  private convertDbModelToBlobModel(dbModel: BlobsModel): BlobModel {
    const blobModel: BlobModel = {
      accountName: this.getModelValue<string>(dbModel, "accountName", true),
      containerName: this.getModelValue<string>(dbModel, "containerName", true),
      name: this.getModelValue<string>(dbModel, "blobName", true),
      isDirectory: this.getModelValue<boolean>(dbModel, "isDirectory", true),
      permissions: toPermissions(
        this.getModelValue<string>(dbModel, "permissions", true)
      )!,
      acl: toAcl(this.getModelValue<string>(dbModel, "acl", true))!,
      owner: this.getModelValue<string>(dbModel, "owner", true),
      group: this.getModelValue<string>(dbModel, "group", true),
      snapshot: this.getModelValue<string>(dbModel, "snapshot", true),
      isCommitted: this.getModelValue<boolean>(dbModel, "isCommitted", true),
      leaseDurationSeconds: this.getModelValue<number>(
        dbModel,
        "leaseDurationSeconds"
      ),
      leaseBreakTime: this.getModelValue<Date>(dbModel, "leaseBreakTime"),
      leaseExpireTime: this.getModelValue<Date>(dbModel, "leaseExpireTime"),
      leaseId: this.getModelValue<string>(dbModel, "leaseId"),
      versionId: this.getModelValue<string>(dbModel, "versionId"),
      persistency: this.deserializeModelValue<IExtentChunk>(
        dbModel,
        "persistency"
      ),
      committedBlocksInOrder: this.deserializeModelValue<
        PersistencyBlockModel[]
      >(dbModel, "committedBlocksInOrder"),
      metadata: this.deserializeModelValue<Models.BlobMetadata>(
        dbModel,
        "metadata"
      ),
      properties: this.deserializeModelValue<Models.BlobPropertiesInternal>(
        dbModel,
        "properties"
      )
    };

    blobModel.properties.contentMD5 = this.restoreUint8Array(
      blobModel.properties.contentMD5
    );
    return blobModel;
  }

  private convertBlobModelToDbModel(blob: BlobModel): object {
    return {
      accountName: blob.accountName,
      containerName: blob.containerName,
      blobName: blob.name,
      snapshot: blob.snapshot,
      isCommitted: blob.isCommitted,
      isDirectory: blob.isDirectory,
      permissions: toPermissionsString(blob.permissions),
      acl: toAclString(blob.acl),
      owner: blob.owner,
      group: blob.group,
      lastModified: blob.properties.lastModified,
      creationTime: blob.properties.creationTime || null,
      leaseBreakTime: blob.leaseBreakTime || null,
      leaseExpireTime: blob.leaseExpireTime || null,
      leaseId: blob.leaseId || null,
      leaseDurationSeconds: blob.leaseDurationSeconds || null,
      versionId: blob.versionId || null,
      persistency: this.serializeModelValue(blob.persistency) || null,
      committedBlocksInOrder:
        this.serializeModelValue(blob.committedBlocksInOrder) || null,
      metadata: this.serializeModelValue(blob.metadata) || null,
      properties: this.serializeModelValue(blob.properties) || null
    };
  }

  private convertDbModelToLease(dbModel: ContainersModel | BlobsModel): ILease {
    const lease =
      (this.deserializeModelValue(dbModel, "lease") as ILease) || {};

    if (lease.leaseBreakTime && typeof lease.leaseBreakTime === "string") {
      lease.leaseBreakTime = new Date(lease.leaseBreakTime);
    }

    if (lease.leaseExpireTime && typeof lease.leaseExpireTime === "string") {
      lease.leaseExpireTime = new Date(lease.leaseExpireTime);
    }

    return lease;
  }

  private convertLeaseToDbBlobsModel(
    properties: Models.BlobPropertiesInternal,
    lease: ILease
  ): object {
    properties.leaseDuration = lease.leaseDurationType;
    properties.leaseState = lease.leaseState;
    properties.leaseStatus = lease.leaseStatus;
    return {
      leaseBreakTime: lease.leaseBreakTime || null,
      leaseExpireTime: lease.leaseExpireTime || null,
      leaseId: lease.leaseId || null,
      leaseDurationSeconds: lease.leaseDurationSeconds || null,
      properties: this.serializeModelValue(properties)
    };
  }

  private convertLeaseToDbModel(lease: ContainerLeaseAdapter): object {
    return { lease: lease.toString() };
  }

  /**
   * Get a blob document model from Loki collection.
   * Will throw BlobNotFound storage error if blob doesn't exist.
   *
   * @protected
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {Context} context
   * @param {undefined} [forceExist]
   * @param {boolean} [forceCommitted] If true, will take uncommitted blob as a non-exist blob and throw exception.
   * @returns {Promise<BlobModel>}
   * @memberof LokiBlobMetadataStore
   */
  private async getBlobWithLeaseUpdated(
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    context: Context,
    forceExist?: true,
    forceCommitted?: boolean,
    transaction?: Transaction
  ): Promise<BlobModel>;

  /**
   * Get a blob document model from Loki collection.
   * Will NOT throw BlobNotFound storage error if blob doesn't exist.
   *
   * @protected
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {Context} context
   * @param {false} forceExist
   * @param {boolean} [forceCommitted] If true, will take uncommitted blob as a non-exist blob and return undefined.
   * @returns {(Promise<BlobModel | undefined>)}
   * @memberof LokiBlobMetadataStore
   */
  private async getBlobWithLeaseUpdated(
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    context: Context,
    forceExist: false,
    forceCommitted?: boolean,
    transaction?: Transaction
  ): Promise<BlobModel | undefined>;

  private async getBlobWithLeaseUpdated(
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    context: Context,
    forceExist?: boolean,
    forceCommitted?: boolean,
    transaction?: Transaction
  ): Promise<BlobModel | undefined> {
    await this.checkContainerExist(context, account, container);

    const blobFindResult = await BlobsModel.findOne({
      where: {
        accountName: account,
        containerName: container,
        blobName: blob,
        snapshot
      },
      transaction
    });

    if (blobFindResult === null || blobFindResult === undefined) {
      if (forceExist === false) {
        return undefined;
      } else {
        throw StorageErrorFactory.getBlobNotFound(context);
      }
    }

    // Force exist if parameter forceExist is undefined or true
    const doc = this.convertDbModelToBlobModel(blobFindResult);
    if (forceExist === undefined || forceExist === true) {
      if (forceCommitted) {
        if (!doc || !(doc as BlobModel).isCommitted) {
          throw StorageErrorFactory.getBlobNotFound(context);
        }
      } else {
        if (!doc) {
          throw StorageErrorFactory.getBlobNotFound(context);
        }
      }
    } else {
      if (forceCommitted) {
        if (!doc || !(doc as BlobModel).isCommitted) {
          return undefined;
        }
      } else {
        if (!doc) {
          return undefined;
        }
      }
    }

    // Snapshot doesn't have lease
    if (snapshot !== undefined && snapshot !== "") {
      new BlobLeaseSyncer(doc).sync({
        leaseId: undefined,
        leaseExpireTime: undefined,
        leaseDurationSeconds: undefined,
        leaseBreakTime: undefined,
        leaseDurationType: undefined,
        leaseState: Models.LeaseStateType.Available, // TODO: Lease state & status should be undefined for snapshots
        leaseStatus: Models.LeaseStatusType.Unlocked // TODO: Lease state & status should be undefined for snapshots
      });
    } else {
      LeaseFactory.createLeaseState(new BlobLeaseAdapter(doc), context).sync(
        new BlobLeaseSyncer(doc)
      );
    }

    return doc;
  }

  /**
   * Get the tier setting from request headers.
   *
   * @private
   * @param {string} tier
   * @returns {(Models.AccessTier | undefined)}
   * @memberof BlobHandler
   */
  private parseTier(tier: string): Models.AccessTier | undefined {
    tier = tier.toLowerCase();
    if (tier === Models.AccessTier.Hot.toLowerCase()) {
      return Models.AccessTier.Hot;
    }
    if (tier === Models.AccessTier.Cool.toLowerCase()) {
      return Models.AccessTier.Cool;
    }
    if (tier === Models.AccessTier.Archive.toLowerCase()) {
      return Models.AccessTier.Archive;
    }
    return undefined;
  }

  private async upsertBlob(
    model: BlobModel,
    transaction: Transaction
  ): Promise<void> {
    if (!this.isPostgres) {
      await BlobsModel.destroy({
        where: {
          accountName: model.accountName,
          containerName: model.containerName,
          blobName: model.name,
          snapshot: model.snapshot
        },
        transaction
      });
    }
    await BlobsModel.upsert(this.convertBlobModelToDbModel(model), {
      transaction
    });
  }

  private async upsertBlock(
    model: BlockModel,
    transaction: Transaction
  ): Promise<void> {
    if (!this.isPostgres) {
      await BlocksModel.destroy({
        where: {
          accountName: model.accountName,
          containerName: model.containerName,
          blobName: model.blobName,
          blockName: model.name
        },
        transaction
      });
    }

    await BlocksModel.upsert(
      {
        accountName: model.accountName,
        containerName: model.containerName,
        blobName: model.blobName,
        blockName: model.name,
        size: model.size,
        persistency: this.serializeModelValue(model.persistency)
      },
      { transaction }
    );
  }

  private async validateExpireConditions(
    context: Context | undefined,
    model: BlobModel | undefined,
    transaction: Transaction | undefined,
    throwError: boolean = true
  ): Promise<boolean> {
    const now = new Date();
    if (
      model &&
      model.properties.expiresOn !== undefined &&
      //date is converted to string in DB so need to restore it
      new Date(model.properties.expiresOn) < now
    ) {
      await BlobsModel.destroy({
        where: {
          accountName: model.accountName,
          containerName: model.containerName,
          blobName: model.name,
          snapshot: model.snapshot
        },
        transaction
      });

      if (throwError && context !== undefined) {
        throw StorageErrorFactory.getBlobNotFound(context);
      }

      return false;
    }

    return true;
  }
}
