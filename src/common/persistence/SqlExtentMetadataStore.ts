import {
  BIGINT,
  Model,
  Op,
  Options as SequelizeOptions,
  Sequelize
} from "sequelize";

import AllExtentsAsyncIterator from "./AllExtentsAsyncIterator";
import IExtentMetadataStore, { IExtentModel } from "./IExtentMetadataStore";

// tslint:disable: max-classes-per-file
class ExtentsModel extends Model {}

/**
 * A SQL based extent metadata storage implementation based on Sequelize.
 * Refer to CONTRIBUTION.md for how to setup SQL database environment.
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
    // Enable encrypt connection for SQL Server
    if (connectionURI.startsWith("mssql") && sequelizeOptions) {
      sequelizeOptions.dialectOptions = sequelizeOptions.dialectOptions || {};
      (sequelizeOptions.dialectOptions as any).options =
        (sequelizeOptions.dialectOptions as any).options || {};
      (sequelizeOptions.dialectOptions as any).options.encrypt = true;
    }
    this.sequelize = new Sequelize(connectionURI, sequelizeOptions);
  }

  public async init(): Promise<void> {
    await this.sequelize.authenticate();

    ExtentsModel.init(
      {
        id: {
          type: "VARCHAR(255)",
          primaryKey: true
        },
        locationId: {
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
        }
      },
      { sequelize: this.sequelize, modelName: "Extents", timestamps: false }
    );

    // TODO: Remove this part which only for test.
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
      ...extent
    })
      .then(() => {
        return;
      })
      .catch((err) => {
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
   * @param {number} [protectTimeInMs]
   * @returns {(Promise<[IExtentModel[], number | undefined]>)}
   * @memberof SqlExtentMetadataStore
   */
  public async listExtents(
    id?: string,
    maxResults?: number,
    marker?: number | string | undefined,
    queryTime?: Date,
    protectTimeInMs?: number
  ): Promise<[IExtentModel[], number | undefined]> {
    const query: any = {};
    if (id !== undefined) {
      query.id = id;
      // console.log(`SqlExtentMetadataStore.listExtents() query ${id}`);
    }
    if (maxResults === undefined) {
      maxResults = 5000;
    }
    if (protectTimeInMs === undefined) {
      protectTimeInMs = 0;
    }
    if (queryTime !== undefined) {
      query.lastModifiedInMS = {
        [Op.lt]: queryTime.getTime() - protectTimeInMs
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
        locationId: this.getModelValue<string>(
          extentsModel,
          "locationId",
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
    }).then((res) => {
      if (res.length < maxResults!) {
        return [res.map((val) => modelConvert(val)), undefined];
      } else {
        const tailItem = res[res.length - 1];
        const nextMarker = this.getModelValue<number>(tailItem, "id", true);
        return [res.map((val) => modelConvert(val)), nextMarker];
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
   * Get the locationId for a given extentId.
   *
   * @param {string} extentId
   * @returns {Promise<string>}
   * @memberof IExtentMetadata
   */
  public async getExtentLocationId(extentId: string): Promise<string> {
    return ExtentsModel.findOne({
      where: {
        id: extentId
      }
    }).then((res) => {
      if (res === null || res === undefined) {
        throw Error(
          `SqlExtentMetadataStore:getExtentLocationId() Error. Extent not exists.`
        );
      }
      const locationId = this.getModelValue<string>(res, "locationId", true);
      return locationId;
    });
  }

  public iteratorExtents(): AsyncIterator<string[]> {
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
