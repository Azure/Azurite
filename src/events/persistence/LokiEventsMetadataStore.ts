import { stat } from "fs";
import Loki from "lokijs";
import { truncatedISO8061Date } from "../../common/utils/utils";

import StorageErrorFactory from "../errors/StorageErrorFactory";
import Context from "../generated/Context";
import { Entity, Table } from "./IEventsMetadataStore";
import IEventsMetadataStore from "./IEventsMetadataStore";

export default class LokiEventsMetadataStore implements IEventsMetadataStore {
  private readonly db: Loki;
  private readonly TABLES_COLLECTION = "$TABLES_COLLECTION$";
  private initialized: boolean = false;
  private closed: boolean = false;

  public constructor(public readonly lokiDBPath: string) {
    this.db = new Loki(lokiDBPath, {
      autosave: true,
      autosaveInterval: 5000,
    });
    /*
    setInterval(() => {
      this.db.saveDatabase(function(err) {
        if (err) {
          console.error('Error autosaving database:', err);
        }
      });
    }, 5000);
    */
  }

  /**
   * Initializes the persistence layer
   *
   * @return {*}  {Promise<void>}
   * @memberof LokiEventsMetadataStore
   */
  public async init(): Promise<void> {
    await this.loadDB();
    this.createTablesCollection();
    await this.saveDBState();
    this.finalizeInitializionState();
  }

  /**
   * Close down the DB
   *
   * @return {*}  {Promise<void>}
   * @memberof LokiEventsMetadataStore
   */
  public async close(): Promise<void> {
    await this.saveDBState();
    await new Promise<void>((resolve, reject) => {
      this.db.close((err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.closed = true;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  /**
   * Create a table in the persistence layer
   *
   * @param {Context} context
   * @param {Table} tableModel
   * @return {*}  {Promise<void>}
   * @memberof LokiEventsMetadataStore
   */
  public async createTable(tableModel: Table): Promise<void> {
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
    
    tableModel.table = tableModel.table.toLowerCase();
    if(this.checkIfTableExists(coll, tableModel)) {
      this.deleteTable(tableModel);
    }

    coll.insert(tableModel);
    this.createCollectionForTable(tableModel);
  }

  /**
   * Delete a table from the persistence layer
   *
   * @param {Context} context
   * @param {string} table
   * @param {string} account
   * @return {*}  {Promise<void>}
   * @memberof LokiEventsMetadataStore
   */
  private async deleteTable({account, table}: Table): Promise<void> {
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
  
    const tableLower = table.toLocaleLowerCase();
    
    const doc = coll.findOne({
      account,
      table: { $regex: [`^${tableLower}$`, "i"] }
    });
    coll.remove(doc);

    this.removeTableCollection(account, doc);
  }

  /**
   * Gets a table from the loki js persistence layer.
   *
   * @param {string} account
   * @param {string} table
   * @param {Context} context
   * @return {*}  {Promise<Table>}
   * @memberof LokiEventsMetadataStore
   */
  public async getTable(
    account: string,
    table: string,
    context: Context
  ): Promise<Table> {
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
    // Azure Storage Service is case insensitive
    const doc = coll.findOne({
      account,
      table: { $regex: [`^${table}$`, "i"] }
    });
    if (!doc) {
      throw StorageErrorFactory.getTableNotFound(context);
    }
    return doc;
  }

  public async insertTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity
  ): Promise<Entity> {
    const tableEntityCollection = this.getEntityCollection(
      account,
      table,
      context
    );

    if(!entity.properties) {
      entity.properties = {};
    }

    entity.properties.Timestamp = truncatedISO8061Date(new Date(), true, true);
    entity.properties["Timestamp@odata.type"] = "Edm.DateTime";

    console.log("Entity to insert: ", entity);
    tableEntityCollection.insert(entity);
    return entity;
  }

  public async queryTableEntities(
    context: Context,
    account: string,
    table: string,
    nextPartitionKey?: string,
    nextRowKey?: string
  ): Promise<[Entity[], string | undefined, string | undefined]> {
   
    return [
      [] as Entity[],
      "",
      ""
    ];
  }

  /**
   * Sets variables that track state of initialized DB
   *
   * @private
   * @memberof LokiEventsMetadataStore
   */
  private finalizeInitializionState() {
    this.initialized = true;
    this.closed = false;
  }

  /**
   * Loads the DB from disk
   *
   * @private
   * @memberof LokiEventsMetadataStore
   */
  private async loadDB() {
    await new Promise<void>((resolve, reject) => {
      stat(this.lokiDBPath, (statError: any) => {
        if (!statError) {
          this.db.loadDatabase({}, (dbError: any) => {
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
  }

  private async saveDBState() {
    await new Promise<void>((resolve, reject) => {
      this.db.saveDatabase((err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Creates the tables collection if it does not exist
   *
   * @private
   * @memberof LokiEventsMetadataStore
   */
  private createTablesCollection() {
    if (this.db.getCollection(this.TABLES_COLLECTION) === null) {
      this.db.addCollection(this.TABLES_COLLECTION, {
        // Optimization for indexing and searching
        // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
        indices: ["account", "table"]
      });
    }
  }

  /**
   * Create a collection to represent the table using a unique string.
   * This optimizes using an index for find operations.
   *
   * @private
   * @param {Table} tableModel
   * @memberof LokiEventsMetadataStore
   */
  private createCollectionForTable(tableModel: Table) {
    const tableCollectionName = this.getTableCollectionName(
      tableModel.account,
      tableModel.table
    );
    const extentColl = this.db.getCollection(tableCollectionName);
    if (extentColl) {
      this.db.removeCollection(tableCollectionName);
    }

    this.db.addCollection(tableCollectionName, {
      // Optimization for indexing and searching
      // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
      indices: ["reqId", "dbType"]
    });
  }

  /**
   * Throws an exception if a table exists
   *
   * @private
   * @param {Collection<any>} coll
   * @param {Table} tableModel
   * @param {Context} context
   * @memberof LokiEventsMetadataStore
   */
  private checkIfTableExists(
    coll: Collection<any>,
    tableModel: Table
  ): boolean {
    const doc = coll.findOne({
      account: tableModel.account,
      table: { $regex: [String.raw`\b${tableModel.table}\b`, "i"] }
    });

    // If the metadata exists, we will throw getTableAlreadyExists error
    return !!doc;
  }

  /**
   * Removes a table collection and index when deleting a table.
   *
   * @private
   * @param {string} account
   * @param {*} doc
   * @memberof LokiEventsMetadataStore
   */
  private removeTableCollection(account: string, doc: any) {
    const tableCollectionName = this.getTableCollectionName(account, doc.table);
    const tableEntityCollection = this.db.getCollection(tableCollectionName);
    if (tableEntityCollection) {
      this.db.removeCollection(tableCollectionName);
    }
  }

  /**
   * Gets the collection of entites for a specific table.
   * Ensures that table name is case insensitive.
   *
   * @private
   * @param {string} account
   * @param {string} table
   * @param {Context} context
   * @return {*}  {Collection<any>}
   * @memberof LokiEventsMetadataStore
   */
  private getEntityCollection(
    account: string,
    table: string,
    context: Context
  ): Collection<any> {
    let tableEntityCollection = this.db.getCollection(
      this.getTableCollectionName(account, table.toLowerCase())
    );
    if (!tableEntityCollection) {
      // this is to avoid a breaking change for users of persisted storage
      tableEntityCollection = this.db.getCollection(
        this.getTableCollectionName(account, table)
      );
      if (!tableEntityCollection) {
        throw StorageErrorFactory.getTableNotExist(context);
      }
    }
    return tableEntityCollection;
  }

  private getTableCollectionName(account: string, table: string): string {
    return `${account}$${table}`;
  }
}
