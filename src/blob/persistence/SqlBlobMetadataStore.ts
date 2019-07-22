import { DATE, Model, Options as SequelizeOptions, Sequelize } from "sequelize";

import { API_VERSION } from "../utils/constants";
import IBlobMetadataStore, {
  BlobModel,
  BlockModel,
  ContainerModel,
  IPersistencyChunk,
  ServicePropertiesModel,
} from "./IBlobMetadataStore";

// tslint:disable: max-classes-per-file

class ServiceModel extends Model {}

/*
 * docker run --name mysql1 -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mysql:latest
 * docker exec -it mysql1 /bin/bash
 *
 * docker run --name mariadb2 -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mariadb:latest
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

    ServiceModel.init(
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
    return this.sequelize
      .transaction(t => {
        return ServiceModel.findByPk(serviceProperties.accountName, {
          transaction: t
        }).then(res => {
          if (res === null) {
            return ServiceModel.create(
              {
                accountName: serviceProperties.accountName,
                defaultServiceVersion: serviceProperties.defaultServiceVersion,
                cors: serviceProperties.cors
                  ? JSON.stringify(serviceProperties.cors)
                  : undefined,
                logging: serviceProperties.logging
                  ? JSON.stringify(serviceProperties.logging)
                  : undefined,
                minuteMetrics: serviceProperties.minuteMetrics
                  ? JSON.stringify(serviceProperties.minuteMetrics)
                  : undefined,
                hourMetrics: serviceProperties.hourMetrics
                  ? JSON.stringify(serviceProperties.hourMetrics)
                  : undefined,
                staticWebsite: serviceProperties.staticWebsite
                  ? JSON.stringify(serviceProperties.staticWebsite)
                  : undefined,
                deleteRetentionPolicy: serviceProperties.deleteRetentionPolicy
                  ? JSON.stringify(serviceProperties.deleteRetentionPolicy)
                  : undefined
              },
              { transaction: t }
            );
          } else {
            return ServiceModel.update(
              {
                defaultServiceVersion: serviceProperties.defaultServiceVersion,
                cors: serviceProperties.cors
                  ? JSON.stringify(serviceProperties.cors)
                  : undefined,
                logging: serviceProperties.logging
                  ? JSON.stringify(serviceProperties.logging)
                  : undefined,
                minuteMetrics: serviceProperties.minuteMetrics
                  ? JSON.stringify(serviceProperties.minuteMetrics)
                  : undefined,
                hourMetrics: serviceProperties.hourMetrics
                  ? JSON.stringify(serviceProperties.hourMetrics)
                  : undefined,
                staticWebsite: serviceProperties.staticWebsite
                  ? JSON.stringify(serviceProperties.staticWebsite)
                  : undefined,
                deleteRetentionPolicy: serviceProperties.deleteRetentionPolicy
                  ? JSON.stringify(serviceProperties.deleteRetentionPolicy)
                  : undefined
              },
              {
                transaction: t,
                where: {
                  accountName: serviceProperties.accountName
                }
              }
            ).then(updateResult => {
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
    return ServiceModel.findByPk(account).then(res => {
      if (res === null) {
        return undefined;
      }

      const ret: ServicePropertiesModel = {
        accountName: account,
        logging: res.get("logging")
          ? JSON.parse(res.get("logging") as string)
          : undefined,
        hourMetrics: res.get("hourMetrics")
          ? JSON.parse(res.get("hourMetrics") as string)
          : undefined,
        minuteMetrics: res.get("minuteMetrics")
          ? JSON.parse(res.get("minuteMetrics") as string)
          : undefined,
        cors: res.get("cors")
          ? JSON.parse(res.get("cors") as string)
          : undefined,
        deleteRetentionPolicy: res.get("deleteRetentionPolicy")
          ? JSON.parse(res.get("deleteRetentionPolicy") as string)
          : undefined,
        staticWebsite: res.get("staticWebsite")
          ? JSON.parse(res.get("staticWebsite") as string)
          : undefined,
        defaultServiceVersion: res.get("defaultServiceVersion") as string
      };
      return ret;
    });
  }

  getContainer<T extends ContainerModel>(
    account: string,
    container: string
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }
  deleteContainer(account: string, container: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  updateContainer<T extends ContainerModel>(container: T): Promise<T> {
    throw new Error("Method not implemented.");
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
  deletePayloads(
    persistency: Iterable<string | IPersistencyChunk>
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

const defaultServiceProperties = {
  cors: [],
  defaultServiceVersion: API_VERSION,
  hourMetrics: {
    enabled: false,
    retentionPolicy: {
      enabled: false
    },
    version: "1.0"
  },
  logging: {
    deleteProperty: true,
    read: true,
    retentionPolicy: {
      enabled: false
    },
    version: "1.0",
    write: true
  },
  minuteMetrics: {
    enabled: false,
    retentionPolicy: {
      enabled: false
    },
    version: "1.0"
  },
  staticWebsite: {
    enabled: false
  }
};

async function main() {
  const store = new SqlBlobMetadataStore(
    "mariadb://root:my-secret-pw@127.0.0.1:3306/azurite_blob_metadata",
    {
      pool: {
        max: 30,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );
  await store.init();

  let res = await store.getServiceProperties("hello");
  console.log(res);

  await store.updateServiceProperties({
    accountName: "hello",
    ...defaultServiceProperties
  });

  res = await store.getServiceProperties("hello");
  console.log(res);

  await store.close();
}

main();
