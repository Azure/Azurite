import * as Models from "../generated/artifacts/models";
import ITableMetadataStore from "./ITableMetadataStore";
import { TABLE_STATUSCODE } from "../utils/constants";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { TableModel } from "../persistence/ITableMetadataStore";
import Loki from "lokijs";
import Context from "../generated/Context";
import { stat } from "fs";

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
    table: TableModel,
    context: Context
  ): Promise<TABLE_STATUSCODE> {
    const coll = this.db.getCollection(this.TABLE_COLLECTION);
    const doc = coll.findOne({
      accountName: table.account,
      name: table.name
    });

    // If the metadata exists, we will throw getTableAlreadyExists error
    if (doc) {
      throw StorageErrorFactory.getTableAlreadyExists(
        context ? context.contextID : undefined
      );
    }

    coll.insert(table);
    return 201;
  }

  public async queryTable(): Promise<Models.TableResponseProperties[]> {
    // TODO

    return undefined as any;
  }

  public async deleteTable(tableName: string): Promise<TABLE_STATUSCODE> {
    // TODO
    return undefined as any;
  }

  public async queryTableEntities(
    table: string,
    propertyName: Array<string>
  ): Promise<{ [propertyName: string]: any }[]> {
    // TODO
    return undefined as any;
  }

  public async queryTableEntitiesWithPartitionAndRowKey(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<{ [propertyName: string]: any }[]> {
    // TODO
    return undefined as any;
  }

  public async updateTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE> {
    // TODO
    return undefined as any;
  }

  public async mergeTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE> {
    // TODO
    return undefined as any;
  }

  public async deleteTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE> {
    // TODO
    return undefined as any;
  }

  public async insertTableEntity(table: string): Promise<TABLE_STATUSCODE> {
    // TODO
    return undefined as any;
  }

  public async getTableAccessPolicy(
    table: string
  ): Promise<Models.TableGetAccessPolicyResponse> {
    // TODO
    return undefined as any;
  }

  public async setTableAccessPolicy(
    table: string
  ): Promise<Models.TableSetAccessPolicyResponse> {
    // TODO
    return undefined as any;
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

    // Create queues collection if not exists
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
