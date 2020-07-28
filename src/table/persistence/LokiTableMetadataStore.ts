import { stat } from "fs";
import Loki from "lokijs";

import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { IEntity, TableModel } from "../persistence/ITableMetadataStore";
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

  public async createTable(context: Context, table: TableModel): Promise<void> {
    const coll = this.db.getCollection(this.TABLE_COLLECTION);
    const doc = coll.findOne({
      accountName: table.account,
      name: table.tableName
    });

    // If the metadata exists, we will throw getTableAlreadyExists error
    if (doc) {
      throw StorageErrorFactory.getTableAlreadyExists(context);
    }
    coll.insert(table);
    const extentColl = this.db.getCollection(
      this.getTableCollectionNameString(table.account, table.tableName)
    );
    if (extentColl) {
      throw StorageErrorFactory.getTableAlreadyExists(context);
    }

    this.db.addCollection(
      this.getTableCollectionNameString(table.account, table.tableName),
      {
        // Optimization for indexing and searching
        // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
        indices: ["ParititionKey", "RowKey"]
      }
    ); // Optimize for find operation
  }

  public async insertTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: IEntity
  ): Promise<void> {
    const tableColl = this.db.getCollection(
      this.getTableCollectionNameString(account, tableName)
    );
    if (!tableColl) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    const doc = tableColl.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    });

    if (doc) {
      throw StorageErrorFactory.getEntityAlreadyExist(context);
    }

    tableColl.insert(entity);
    return;
  }

  public async queryTable(
    context: Context
  ): Promise<Models.TableResponseProperties[]> {
    // TODO
    throw new NotImplementedError();
  }

  public async deleteTable(
    context: Context,
    name: string,
    account: string
  ): Promise<void> {
    const tableColl = this.db.getCollection(
      this.getTableCollectionNameString(account, name)
    );
    // delete the collection / table
    if (tableColl != null) {
      this.db.removeCollection(name);
    } else {
      // tslint:disable-next-line: no-console
      console.log("DID NOT FIND:" + name);
      throw StorageErrorFactory.getTableNotFound(context);
    }
    // remove table reference from collection registry
    const coll = this.db.getCollection(this.TABLE_COLLECTION);
    const doc = coll.find({
      accountName: account,
      tableName: name
    });
    if (doc != null) {
      coll.remove(doc);
    } else {
      throw StorageErrorFactory.getTableNotFound(context);
    }
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
  ): Promise<void> {
    // TODO
    throw new NotImplementedError();
  }

  public async mergeTableEntity(
    context: Context,
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<void> {
    // TODO
    throw new NotImplementedError();
  }

  public async deleteTableEntity(
    context: Context,
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<void> {
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
        indices: ["accountName", "tableName"]
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
  private getTableCollectionNameString(
    accountName: string,
    tableName: string
  ): string {
    return accountName + "_" + tableName;
  }
}
