import { stat } from "fs";
import Loki from "lokijs";

import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { TableModel } from "../persistence/ITableMetadataStore";
import { TABLE_STATUSCODE } from "../utils/constants";
import ITableMetadataStore from "./ITableMetadataStore";

export default class LokiTableMetadataStore implements ITableMetadataStore {
  private readonly db: Loki;
  private readonly TABLE_COLLECTION = "$TABLE_COLLECTION$";
  private initialized: boolean = false;
  private closed: boolean = false;

  public constructor(public readonly lokiDBPath: string) {
    this.db = new Loki(lokiDBPath, {
      autosave: true,
      autosaveInterval: 5000
    });
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public async createTable(
    context: Context,
    table: TableModel
  ): Promise<TABLE_STATUSCODE> {
    const coll = this.db.getCollection(this.TABLE_COLLECTION);
    const doc = coll.findOne({
      accountName: table.account,
      name: table.name
    });

    // If the metadata exists, we will throw getTableAlreadyExists error
    if (doc) {
      throw StorageErrorFactory.getTableAlreadyExists(
        context.contextID
      );
    }

    coll.insert(table);
    return 201;
  }

  public async queryTable(context: Context): Promise<Models.TableResponseProperties[]> {
    // TODO
    throw new NotImplementedError();
  }

  public async deleteTable(context: Context, tableName: string): Promise<TABLE_STATUSCODE> {
    // TODO    context: Context
    throw new NotImplementedError();
  }

  public async queryTableEntities(
    context: Context,
    table: string,
    propertyName: Array<string>
  ): Promise<{ [propertyName: string]: any }[]> {
    // TODO
    throw new NotImplementedError();
  }

  public async queryTableEntitiesWithPartitionAndRowKey(
    context: Context,
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<{ [propertyName: string]: any }[]> {
    // TODO
    throw new NotImplementedError();
  }

  public async updateTableEntity(
    context: Context,
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE> {
    // TODO
    throw new NotImplementedError();
  }

  public async mergeTableEntity(
    context: Context,
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE> {
    // TODO
    throw new NotImplementedError();
  }

  public async deleteTableEntity(
    context: Context,
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE> {
    // TODO
    throw new NotImplementedError();
  }

  public async insertTableEntity(context: Context, table: string): Promise<TABLE_STATUSCODE> {
    // TODO
    throw new NotImplementedError();
  }

  public async getTableAccessPolicy(
    context: Context,
    table: string
  ): Promise<Models.TableGetAccessPolicyResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async setTableAccessPolicy(
    context: Context,
    table: string
  ): Promise<Models.TableSetAccessPolicyResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async init(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      stat(this.lokiDBPath, (statError, stats) => {
        if (!statError) {
          this.db.loadDatabase({}, dbError => {
            if (dbError) {
              reject(dbError);
            } else {
              resolve();
            }
          });
        } else {
          // when DB file doesn't exist, ignore the error because following will re-create the file
          resolve();
        }
      });
    });

    // Create tables collection if not exists
    if (this.db.getCollection(this.TABLE_COLLECTION) === null) {
      this.db.addCollection(this.TABLE_COLLECTION, {
        // Optimization for indexing and searching
        // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
        indices: ["accountName", "name"]
      }); // Optimize for find operation
    }

    await new Promise((resolve, reject) => {
      this.db.saveDatabase(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.initialized = true;
    this.closed = false;
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.closed = true;
  }
}
