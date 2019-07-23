import { BOOLEAN, DATE, Model, Options as SequelizeOptions, Sequelize } from "sequelize";

import StorageErrorFactory from "../errors/StorageErrorFactory";
import IBlobMetadataStore, {
  BlobModel,
  BlockModel,
  ContainerModel,
  ServicePropertiesModel,
} from "./IBlobMetadataStore";

// tslint:disable: max-classes-per-file
class ServicesModel extends Model {}
class ContainersModel extends Model {}

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
      { sequelize: this.sequelize, modelName: "Services" }
    );

    // TODO: Duplicate models definition here with migrations files; Should update them together to avoid inconsistency
    ContainersModel.init(
      {
        accountName: {
          type: "VARCHAR(255)",
          primaryKey: true
        },
        containerName: {
          type: "VARCHAR(255)",
          primaryKey: true
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
        createdAt: {
          allowNull: false,
          type: DATE
        },
        updatedAt: {
          allowNull: false,
          type: DATE
        }
      },
      { sequelize: this.sequelize, modelName: "Containers" }
    );

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

  public async updateServiceProperties<T extends ServicePropertiesModel>(
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

  public async getContainer(
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

  listContainers<T extends ContainerModel>(
    account: string,
    prefix?: string | undefined,
    maxResults?: number | undefined,
    marker?: number | undefined
  ): Promise<[T[], number | undefined]> {
    throw new Error("Method not implemented.");
  }

  deleteBlobs(account: string, container: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  updateBlob<T extends BlobModel>(blob: T): Promise<T> {
    throw new Error("Method not implemented.");
  }

  getBlob<T extends BlobModel>(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }

  listBlobs<T extends BlobModel>(
    account?: string | undefined,
    container?: string | undefined,
    blob?: string | undefined,
    prefix?: string | undefined,
    maxResults?: number | undefined,
    marker?: number | undefined,
    includeSnapshots?: boolean | undefined
  ): Promise<[T[], number | undefined]> {
    throw new Error("Method not implemented.");
  }

  deleteBlob(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  updateBlock<T extends BlockModel>(block: T): Promise<T> {
    throw new Error("Method not implemented.");
  }

  deleteBlocks(
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  insertBlocks<T extends BlockModel>(blocks: T[]): Promise<T[]> {
    throw new Error("Method not implemented.");
  }

  getBlock<T extends BlockModel>(
    account: string,
    container: string,
    blob: string,
    block: string,
    isCommitted: boolean
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }

  listBlocks<T extends BlockModel>(
    account?: string | undefined,
    container?: string | undefined,
    blob?: string | undefined,
    isCommitted?: boolean | undefined
  ): Promise<T[]> {
    throw new Error("Method not implemented.");
  }

  private getModelValue<T>(model: Model, key: string): T | undefined {
    return model.get(key) as T | undefined;
  }

  private deserializeModelValue(model: Model, key: string): any {
    const rawValue = this.getModelValue<string>(model, key);
    if (typeof rawValue === "string") {
      // TODO: Decouple deserializer
      return JSON.parse(rawValue);
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
