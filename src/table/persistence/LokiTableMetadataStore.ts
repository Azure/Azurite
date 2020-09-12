import { stat } from "fs";
import Loki from "lokijs";
import { newEtag } from "../../common/utils/utils";
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
    // Check for table entry in the table registry collection
    const coll = this.db.getCollection(this.TABLE_COLLECTION);
    const doc = coll.findOne({
      account: table.account,
      name: table.tableName
    });

    // If the metadata exists, we will throw getTableAlreadyExists error
    if (doc) {
      throw StorageErrorFactory.getTableAlreadyExists(context);
    }
    coll.insert(table);

    // now we create the collection to represent the table using a unique string
    const uniqueTableName = this.getUniqueTableCollectionName(
      table.account,
      table.tableName
    );
    const extentColl = this.db.getCollection(uniqueTableName);
    if (extentColl) {
      throw StorageErrorFactory.getTableAlreadyExists(context);
    }

    this.db.addCollection(uniqueTableName, {
      // Optimization for indexing and searching
      // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
      indices: ["PartitionKey", "RowKey"]
    }); // Optimize for find operation
  }

  public async insertTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: IEntity
  ): Promise<void> {
    const tableColl = this.db.getCollection(
      this.getUniqueTableCollectionName(account, tableName)
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
    context: Context,
    accountName: string
  ): Promise<Models.TableResponseProperties[]> {
    const coll = this.db.getCollection(this.TABLE_COLLECTION);
    const docList = coll.find({ account: accountName });

    if (!docList) {
      throw StorageErrorFactory.getEntityNotFound(context);
    }

    let response: Models.TableResponseProperties[] = [];

    if (docList.length > 0) {
      response = docList.map(item => {
        return {
          odatatype: item.odatatype,
          odataid: item.odataid,
          odataeditLink: item.odataeditLink,
          tableName: item.tableName
        };
      });
    }

    return response;
  }

  public async deleteTable(
    context: Context,
    name: string,
    accountName: string
  ): Promise<void> {
    const uniqueTableName = this.getUniqueTableCollectionName(
      accountName,
      name
    );
    const tableColl = this.db.getCollection(uniqueTableName);
    // delete the collection / table
    if (tableColl != null) {
      this.db.removeCollection(uniqueTableName);
    } else {
      throw StorageErrorFactory.getTableNotFound(context);
    }
    // remove table reference from collection registry
    const coll = this.db.getCollection(this.TABLE_COLLECTION);
    const doc = coll.findOne({
      account: accountName,
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
    tableName: string,
    accountName: string,
    partitionKey: string,
    rowKey: string
  ): Promise<IEntity> {
    const tableColl = this.db.getCollection(
      this.getUniqueTableCollectionName(accountName, tableName)
    );

    // Throw error, if table not exists
    if (!tableColl) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    // Get requested Doc
    const requestedDoc = tableColl.findOne({
      PartitionKey: partitionKey,
      RowKey: rowKey
    }) as IEntity;

    return requestedDoc;
  }

  public async updateTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: IEntity,
    etag: string
  ): Promise<void> {
    const tableColl = this.db.getCollection(
      this.getUniqueTableCollectionName(account, tableName)
    );

    // Throw error, if table not exists
    if (!tableColl) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    // Get Current Doc
    const currentDoc = tableColl.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    }) as IEntity;

    // Throw error, if doc does not exist
    if (!currentDoc) {
      throw StorageErrorFactory.getEntityNotExist(context);
    } else {
      // Test if etag value is valid
      if (etag === "*" || currentDoc.eTag === etag) {
        tableColl.remove(currentDoc);
        tableColl.insert(entity);
        return;
      }
    }

    throw StorageErrorFactory.getPreconditionFailed(context);
  }

  public async mergeTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: IEntity,
    etag: string
  ): Promise<string> {
    const tableColl = this.db.getCollection(
      this.getUniqueTableCollectionName(account, tableName)
    );

    // Throw error, if table not exists
    if (!tableColl) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    // Get Current Doc
    const currentDoc = tableColl.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    }) as IEntity;

    // Throw error, if doc does not exist
    if (!currentDoc) {
      throw StorageErrorFactory.getEntityNotExist(context);
    } else {
      // Test if etag value is valid
      if (etag === "*" || currentDoc.eTag === etag) {
        const mergedDoc = {
          ...currentDoc,
          ...entity
        };
        mergedDoc.eTag = newEtag();
        tableColl.update(mergedDoc);
        return mergedDoc.eTag;
      }
    }
    throw StorageErrorFactory.getPreconditionFailed(context);
  }

  public async deleteTableEntity(
    context: Context,
    tableName: string,
    accountName: string,
    partitionKey: string,
    rowKey: string,
    etag: string
  ): Promise<void> {
    const tableColl = this.db.getCollection(
      this.getUniqueTableCollectionName(accountName, tableName)
    );
    if (!tableColl) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    if (partitionKey !== undefined && rowKey !== undefined) {
      const doc = tableColl.findOne({
        PartitionKey: partitionKey,
        RowKey: rowKey
      }) as IEntity;

      if (!doc) {
        throw StorageErrorFactory.getEntityNotFound(context);
      } else {
        if (etag !== "*" && doc.eTag !== etag) {
          throw StorageErrorFactory.getPreconditionFailed(context);
        }
      }
      tableColl.remove(doc);
      return;
    }

    throw StorageErrorFactory.getPropertiesNeedValue(context);
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

  private getUniqueTableCollectionName(
    accountName: string,
    tableName: string
  ): string {
    return `${accountName}$${tableName}`;
  }
}
