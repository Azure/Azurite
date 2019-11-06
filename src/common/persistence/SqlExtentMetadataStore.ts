import {
  BIGINT,
  DATE,
  Model,
  Op,
  Options as SequelizeOptions,
  Sequelize
} from "sequelize";

import AllExtentsAsyncIterator from "./AllExtentsAsyncIterator";
import IExtentMetadataStore, { IExtentModel } from "./IExtentMetadataStore";

// tslint:disable: max-classes-per-file
class ExtentsModel extends Model {}

/*
 * Preparations before starting with Sql based metadata store implementation
 * 1. Setup a database, like MySql, MariaDB, Sql Server or SqlLite
 * 2. (For development) Update database connection configurations under migrations/extent/metadata/config/config.json;
 *    (For production) Update environment variables `AZURITE_DB_USERNAME`, `AZURITE_DB_PASSWORD`, `AZURITE_DB_NAME`,
 *    `AZURITE_DB_HOSTNAME`, `AZURITE_DB_DIALECT`
 * 3. Create a database by `npm run db:create:extent:metadata` or create it manually
 * 4. Migrate database by `npm run db:migrate:extent:metadata`
 *
 * Steps to setup database in docker:
 * - docker run --name mariadb -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mariadb:latest
 *
 * - docker run --name mysql1 -p 3306:3306 -e MYSQL_ROOT_PASSWORD=my-secret-pw -d mysql:latest
 * - docker exec -it mysql1 /bin/bash
 *
 */

/**
 * A SQL based extent metadata storage implementation based on Sequelize.
 *
 * @export
 * @class SqlExtentMetadataStore
 * @implements {IExtentMetadataStore}
 */
export default class SqlExtentMetadataStore implements IExtentMetadataStore {
  private initialized: boolean = false;
  private closed: boolean = false;
  private readonly sequelize: Sequelize;

  /**
   * Creates an instance of SqlExtentMetadataStore.
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
    ExtentsModel.init(
      {
        id: {
          type: "VARCHAR(255)",
          primaryKey: true
        },
        persistencyId: {
          allowNull: false,
          type: "VARCHAR(255)"
        },
        path: {
          type: "VARCHAR(255)"
        },
        size: {
          allowNull: false,
          type: BIGINT.UNSIGNED
        },
        lastModifiedInMS: {
          allowNull: false,
          type: BIGINT.UNSIGNED
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
      { sequelize: this.sequelize, modelName: "Extents" }
    );

    // TODO: Remove this part which only for test.
    this.sequelize.sync();

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

  /**
   * Update the extent status in DB. A new item will be created if the extent does not exists.
   *
   * @param {IExtentModel} extent
   * @returns {Promise<void>}
   * @memberof LokiExtentMetadata
   */
  public async updateExtent(extent: IExtentModel): Promise<void> {
    return ExtentsModel.upsert({
      id: extent.id,
      ...extent
    })
      .then(() => {
        return;
      })
      .catch(err => {
        // console.log(`SqlExtentMetadataStore.updateExtent() upsert err:${err}`);
        throw err;
      });
  }

  /**
   *
   * List extents.
   * @param {string} [id]
   * @param {number} [maxResults]
   * @param {(number | undefined)} [marker]
   * @param {Date} [queryTime]
   * @param {number} [releaseTime]
   * @returns {(Promise<[IExtentModel[], number | undefined]>)}
   * @memberof SqlExtentMetadataStore
   */
  public async listExtents(
    id?: string,
    maxResults?: number,
    marker?: number | string | undefined,
    queryTime?: Date,
    releaseTime?: number
  ): Promise<[IExtentModel[], number | undefined]> {
    const query: any = {};
    if (id !== undefined) {
      query.id = id;
      // console.log(`SqlExtentMetadataStore.listExtents() query ${id}`);
    }
    if (maxResults === undefined) {
      maxResults = 5000;
    }
    if (releaseTime === undefined) {
      releaseTime = 0;
    }
    if (queryTime !== undefined) {
      query.lastModifiedInMS = {
        [Op.lt]: queryTime.getTime() - releaseTime
      };
    }
    if (marker !== undefined) {
      query.id = {
        [Op.gt]: marker
      };
    }

    const modelConvert = (extentsModel: ExtentsModel): IExtentModel => {
      const getId = this.getModelValue<string>(extentsModel, "id", true);
      return {
        id: getId,
        persistencyId: this.getModelValue<string>(
          extentsModel,
          "persistencyId",
          true
        ),
        path: this.getModelValue<string>(extentsModel, "path") || getId,
        size: this.getModelValue<number>(extentsModel, "size", true),
        lastModifiedInMS: this.getModelValue<number>(
          extentsModel,
          "lastModifiedInMS",
          true
        )
      };
    };

    return ExtentsModel.findAll({
      limit: maxResults,
      where: query as any,
      order: [["id", "ASC"]]
    }).then(res => {
      if (res.length < maxResults!) {
        return [res.map(val => modelConvert(val)), undefined];
      } else {
        const tailItem = res[res.length - 1];
        const nextMarker = this.getModelValue<number>(tailItem, "id", true);
        return [res.map(val => modelConvert(val)), nextMarker];
      }
    });
  }

  /**
   * Delete the extent metadata from DB with the extentId.
   *
   * @param {string} extentId
   * @returns {Promise<void>}
   * @memberof IExtentMetadata
   */
  public async deleteExtent(extentId: string): Promise<void> {
    return ExtentsModel.destroy({
      where: {
        id: extentId
      }
    }).then(() => {
      return;
    });
  }

  /**
   * Get the persistencyId for a given extentId.
   *
   * @param {string} extentId
   * @returns {Promise<string>}
   * @memberof IExtentMetadata
   */
  public async getExtentPersistencyId(extentId: string): Promise<string> {
    return ExtentsModel.findOne({
      where: {
        id: extentId
      }
    }).then(res => {
      if (res === null || res === undefined) {
        throw Error(
          `SqlExtentMetadataStore:getExtentPersistencyId() Error. Extent not exists.`
        );
      }
      const persistencyId = this.getModelValue<string>(
        res,
        "persistencyId",
        true
      );
      return persistencyId;
    });
  }

  public getExtentIterator(): AsyncIterator<string[]> {
    return new AllExtentsAsyncIterator(this);
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
}
