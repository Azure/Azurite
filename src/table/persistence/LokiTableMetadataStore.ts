import { stat } from "fs";
import Loki from "lokijs";

import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { Entity, Table } from "../persistence/ITableMetadataStore";
import { ODATA_TYPE, QUERY_RESULT_MAX_NUM } from "../utils/constants";
import ITableMetadataStore, { TableACL } from "./ITableMetadataStore";
import LokiTableStoreQueryGenerator from "./LokiTableStoreQueryGenerator";
import { rimrafAsync } from "../../common/utils/utils";

/** MODELS FOR SERVICE */
interface IServiceAdditionalProperties {
  accountName: string;
}

export type ServicePropertiesModel = Models.TableServiceProperties &
  IServiceAdditionalProperties;

export default class LokiTableMetadataStore implements ITableMetadataStore {
  private readonly db: Loki;
  private readonly TABLES_COLLECTION = "$TABLES_COLLECTION$";
  private readonly SERVICES_COLLECTION = "$SERVICES_COLLECTION$";
  private initialized: boolean = false;
  private closed: boolean = false;
  // The Rollback Entities arrays hold the rows that we will reapply to the database in the case
  // that we need to rollback a transaction.
  // We make the assumption that there will not be any IO during the processing of a transaction
  // and assume that the execution will remain in the same thread associated with the transaction.
  // See: https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/
  private transactionRollbackTheseEntities: Entity[] = []; // can maybe use Entity instead of any
  private transactionDeleteTheseEntities: Entity[] = []; // can maybe use Entity instead of any

  public constructor(public readonly lokiDBPath: string, inMemory: boolean) {
    this.db = new Loki(lokiDBPath, inMemory ? {
      persistenceMethod: "memory"
    } : {
      persistenceMethod: "fs",
      autosave: true,
      autosaveInterval: 5000
    });
  }

  /**
   * Initializes the persistence layer
   *
   * @return {*}  {Promise<void>}
   * @memberof LokiTableMetadataStore
   */
  public async init(): Promise<void> {
    await this.loadDB();
    this.createTablesCollection();
    this.createServicePropsCollection();
    await this.saveDBState();
    this.finalizeInitializationState();
  }

  /**
   * Close down the DB
   *
   * @return {*}  {Promise<void>}
   * @memberof LokiTableMetadataStore
   */
  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.closed = true;
  }

  /**
   * Clean LokiTableMetadataStore.
   *
   * @returns {Promise<void>}
   * @memberof LokiTableMetadataStore
   */
  public async clean(): Promise<void> {
    if (this.isClosed()) {
      await rimrafAsync(this.lokiDBPath);

      return;
    }
    throw new Error(`Cannot clean LokiTableMetadataStore, it's not closed.`);
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
   * @memberof LokiTableMetadataStore
   */
  public async createTable(context: Context, tableModel: Table): Promise<void> {
    // Check for table entry in the table registry collection
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
    // Azure Storage Service is case-insensitive
    tableModel.table = tableModel.table;
    this.checkIfTableExists(coll, tableModel, context);

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
   * @memberof LokiTableMetadataStore
   */
  public async deleteTable(
    context: Context,
    table: string,
    account: string
  ): Promise<void> {
    // remove table reference from collection registry
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
    // Azure Storage Service is case-insensitive
    const tableLower = table.toLocaleLowerCase();
    const doc = coll.findOne({
      account,
      table: { $regex: [`^${tableLower}$`, "i"] }
    });
    this.checkIfResourceExists(doc, context);
    coll.remove(doc);

    this.removeTableCollection(account, doc);
  }

  /**
   * Update the ACL of an existing table item in persistency layer.
   *
   * @param {string} account
   * @param {string} table
   * @param {TableACL} [tableACL]
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof LokiTableMetadataStore
   */
  public async setTableACL(
    account: string,
    table: string,
    context: Context,
    tableACL?: TableACL
  ): Promise<void> {
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
    // Azure Storage Service is case-insensitive
    const tableLower = table.toLocaleLowerCase();
    const persistedTable = coll.findOne({
      account,
      table: { $regex: [`^${tableLower}$`, "i"] }
    });

    if (!persistedTable) {
      throw StorageErrorFactory.getTableNotFound(context);
    }

    persistedTable.tableAcl = tableACL;
    coll.update(persistedTable);
  }

  /**
   * Gets a table from the loki js persistence layer.
   *
   * @param {string} account
   * @param {string} table
   * @param {Context} context
   * @return {*}  {Promise<Table>}
   * @memberof LokiTableMetadataStore
   */
  public async getTable(
    account: string,
    table: string,
    context: Context
  ): Promise<Table> {
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
    // Azure Storage Service is case-insensitive
    const doc = coll.findOne({
      account,
      table: { $regex: [`^${table}$`, "i"] }
    });
    if (!doc) {
      throw StorageErrorFactory.getTableNotFound(context);
    }
    return doc;
  }

  public async queryTable(
    context: Context,
    account: string,
    queryOptions: Models.QueryOptions,
    nextTable?: string
  ): Promise<[Table[], string | undefined]> {
    const coll = this.db.getCollection(this.TABLES_COLLECTION);

    const filter = { account } as any;
    if (nextTable) {
      filter.table = { $gte: nextTable };
    }

    let queryWhere;
    try {
      queryWhere = LokiTableStoreQueryGenerator.generateQueryTableWhereFunction(
        queryOptions.filter
      );
    } catch (e) {
      throw StorageErrorFactory.getQueryConditionInvalid(context);
    }

    const top = queryOptions.top || 1000;

    const docList = coll
      .chain()
      .find(filter)
      .where(queryWhere)
      .simplesort("table")
      .limit(top + 1)
      .data();

    let nextTableName;
    if (docList.length > top) {
      const tail = docList.pop();
      nextTableName = tail.table;
    }

    if (!docList) {
      throw StorageErrorFactory.getEntityNotFound(context);
    }

    return [docList, nextTableName];
  }

  public async insertTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    batchId?: string
  ): Promise<Entity> {
    const tableEntityCollection = this.getEntityCollection(
      account,
      table,
      context
    );

    const doc = tableEntityCollection.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    });
    if (doc) {
      throw StorageErrorFactory.getEntityAlreadyExist(context);
    }

    entity.properties.Timestamp = entity.lastModifiedTime;
    entity.properties["Timestamp@odata.type"] = "Edm.DateTime";

    if (batchId !== "" && batchId !== undefined) {
      this.transactionDeleteTheseEntities.push(entity);
    }
    tableEntityCollection.insert(entity);
    return entity;
  }

  public async insertOrUpdateTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    ifMatch?: string,
    batchId?: string
  ): Promise<Entity> {
    if (ifMatch === undefined) {
      // Upsert
      const existingEntity =
        await this.queryTableEntitiesWithPartitionAndRowKey(
          context,
          table,
          account,
          entity.PartitionKey,
          entity.RowKey,
          batchId
        );

      if (existingEntity) {
        // Update
        return this.updateTableEntity(
          context,
          table,
          account,
          entity,
          ifMatch,
          batchId
        );
      } else {
        // Insert
        return this.insertTableEntity(context, table, account, entity, batchId);
      }
    } else {
      // Update
      return this.updateTableEntity(
        context,
        table,
        account,
        entity,
        ifMatch,
        batchId
      );
    }
  }

  public async insertOrMergeTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    ifMatch?: string,
    batchId?: string
  ): Promise<Entity> {
    if (ifMatch === undefined) {
      // Upsert
      const existingEntity =
        await this.queryTableEntitiesWithPartitionAndRowKey(
          context,
          table,
          account,
          entity.PartitionKey,
          entity.RowKey
        );

      if (existingEntity) {
        // Merge
        return this.mergeTableEntity(
          context,
          table,
          account,
          entity,
          ifMatch,
          batchId
        );
      } else {
        // Insert
        return this.insertTableEntity(context, table, account, entity, batchId);
      }
    } else {
      // Merge
      return this.mergeTableEntity(
        context,
        table,
        account,
        entity,
        ifMatch,
        batchId
      );
    }
  }

  public async deleteTableEntity(
    context: Context,
    table: string,
    account: string,
    partitionKey: string,
    rowKey: string,
    etag: string,
    batchId: string
  ): Promise<void> {
    const tableEntityCollection = this.getEntityCollection(
      account,
      table,
      context
    );

    if (partitionKey !== undefined && rowKey !== undefined) {
      const doc = tableEntityCollection.findOne({
        PartitionKey: partitionKey,
        RowKey: rowKey
      }) as Entity;

      this.checkForMissingEntity(doc, context);

      this.checkIfMatchPrecondition(etag, doc, context);

      this.trackRollback(batchId, doc);
      tableEntityCollection.remove(doc);
      return;
    }

    throw StorageErrorFactory.getPropertiesNeedValue(context);
  }

  public async queryTableEntities(
    context: Context,
    account: string,
    table: string,
    queryOptions: Models.QueryOptions,
    nextPartitionKey?: string,
    nextRowKey?: string
  ): Promise<[Entity[], string | undefined, string | undefined]> {
    const tableEntityCollection = this.getEntityCollection(
      account,
      table,
      context
    );

    const queryWhere =
      LokiTableStoreQueryGenerator.generateQueryForPersistenceLayer(
        queryOptions,
        context
      );

    const maxResults = this.getMaxResultsOption(queryOptions);

    // Decode the nextPartitionKey and nextRowKey. This is necessary since non-ASCII characters can
    // be in partition and row keys but should not be in headers.
    const decodedNextPartitionKey =
      this.decodeContinuationHeader(nextPartitionKey);
    const decodedNextRowKey = this.decodeContinuationHeader(nextRowKey);

    // .find using a segment filter is not filtering in the same way that the sorting function sorts
    // I think offset will cause more problems than it solves, as we will have to step and sort all
    // results here, so I am adding 2 additional predicates here to cover the cases with
    // multiple partitions and rows to paginate
    const result = tableEntityCollection
      .chain()
      .where(queryWhere)
      .where((data: any) => {
        if (decodedNextPartitionKey !== undefined) {
          if (data.PartitionKey > decodedNextPartitionKey) {
            return true;
          }
        }
        if (decodedNextRowKey !== undefined) {
          if (
            data.RowKey >= decodedNextRowKey &&
            (data.PartitionKey === decodedNextPartitionKey ||
              data.PartitionKey === undefined)
          ) {
            return true;
          }
          return false;
        }
        if (decodedNextPartitionKey !== undefined) {
          if (data.PartitionKey < decodedNextPartitionKey) {
            return false;
          }
        }
        return true;
      })
      .sort((obj1, obj2) => {
        if (obj1.PartitionKey > obj2.PartitionKey) {
          return 1;
        } else if (obj1.PartitionKey === obj2.PartitionKey) {
          if (obj1.RowKey > obj2.RowKey) {
            return 1;
          } else if (obj1.RowKey === obj2.RowKey) {
            return 0;
          } else {
            return -1;
          }
        } else {
          return -1;
        }
      })
      .limit(maxResults + 1)
      .data();

    const response = this.adjustQueryResultforTop(result, maxResults);

    return [
      result,
      response.nextPartitionKeyResponse,
      response.nextRowKeyResponse
    ];
  }

  public async queryTableEntitiesWithPartitionAndRowKey(
    context: Context,
    table: string,
    account: string,
    partitionKey: string,
    rowKey: string,
    batchId?: string
  ): Promise<Entity | undefined> {
    const entityCollection = this.getEntityCollection(account, table, context);
    const requestedDoc = entityCollection.findOne({
      PartitionKey: partitionKey,
      RowKey: rowKey
    }) as Entity;

    return requestedDoc;
  }

  public async getTableAccessPolicy(
    context: Context,
    table: string
  ): Promise<Models.TableGetAccessPolicyResponse> {
    // TODO
    throw new NotImplementedError(context);
  }

  public async setTableAccessPolicy(
    context: Context,
    table: string
  ): Promise<Models.TableSetAccessPolicyResponse> {
    // TODO
    throw new NotImplementedError(context);
  }

  /**
   * Get service properties for specific storage account.
   *
   * @param {string} account
   * @returns {Promise<ServicePropertiesModel | undefined>}
   * @memberof LokiBlobMetadataStore
   */
  public async getServiceProperties(
    context: Context,
    account: string
  ): Promise<ServicePropertiesModel | undefined> {
    const coll = this.db.getCollection(this.SERVICES_COLLECTION);
    if (coll) {
      const doc = coll.by("accountName", account);
      return doc ? doc : undefined;
    }
    return undefined;
  }

  /**
   * Update table service properties.
   * THis will create service properties if they do not exist in the persistence layer.
   *
   * TODO: Account's service property should be created when storage account is created or metadata
   * storage initialization. This method should only be responsible for updating existing record.
   * In this way, we can reduce one I/O call to get account properties.
   * Undefined properties will be ignored during properties setup.
   *
   * @param {ServicePropertiesModel} serviceProperties
   * @returns {Promise<ServicePropertiesModel>}
   * @memberof LokiBlobMetadataStore
   */
  public async setServiceProperties(
    context: Context,
    serviceProperties: ServicePropertiesModel
  ): Promise<ServicePropertiesModel> {
    const coll = this.db.getCollection(this.SERVICES_COLLECTION);
    const doc = coll.by("accountName", serviceProperties.accountName);

    if (doc) {
      doc.cors =
        serviceProperties.cors === undefined
          ? doc.cors
          : serviceProperties.cors;

      doc.hourMetrics =
        serviceProperties.hourMetrics === undefined
          ? doc.hourMetrics
          : serviceProperties.hourMetrics;

      doc.logging =
        serviceProperties.logging === undefined
          ? doc.logging
          : serviceProperties.logging;

      doc.minuteMetrics =
        serviceProperties.minuteMetrics === undefined
          ? doc.minuteMetrics
          : serviceProperties.minuteMetrics;

      return coll.update(doc);
    } else {
      return coll.insert(serviceProperties);
    }
  }

  /**
   * Validates state for start of batch.
   * Instead of copying all entities / rows in the collection,
   * we shall just backup those rows that we change.
   * Keeping the batchId in the interface to allow logging scenarios to extend.
   *
   * @param {string} batchId
   * @return {*}  {Promise<void>}
   * @memberof LokiTableMetadataStore
   */
  public async beginBatchTransaction(batchId: string): Promise<void> {
    if (
      this.transactionRollbackTheseEntities.length > 0 ||
      this.transactionDeleteTheseEntities.length > 0
    ) {
      throw new Error("Transaction Overlap!");
    }
  }

  /**
   * Ends a batch transaction and will allow for rollback if needed.
   *
   * @param {string} account
   * @param {string} table
   * @param {string} batchId
   * @param {Context} context
   * @param {boolean} succeeded
   * @return {*}  {Promise<void>}
   * @memberof LokiTableMetadataStore
   */
  public async endBatchTransaction(
    account: string,
    table: string,
    batchId: string,
    context: Context,
    succeeded: boolean
  ): Promise<void> {
    // rollback all changes in the case of failed batch transaction
    if (!succeeded) {
      const tableBatchCollection = this.db.getCollection(
        this.getTableCollectionName(account, table)
      );
      if (tableBatchCollection) {
        this.rollbackEntityChanges(tableBatchCollection);

        this.removeEntitiesAddedInBatch(tableBatchCollection);
      }
    }
    // reset entity rollback trackers
    this.transactionRollbackTheseEntities = [];
    this.transactionDeleteTheseEntities = [];
  }

  /**
   * Sets variables that track state of initialized DB
   *
   * @private
   * @memberof LokiTableMetadataStore
   */
  private finalizeInitializationState() {
    this.initialized = true;
    this.closed = false;
  }

  /**
   * Loads the DB from disk
   *
   * @private
   * @memberof LokiTableMetadataStore
   */
  private async loadDB() {
    await new Promise<void>((resolve, reject) => {
      stat(this.lokiDBPath, (statError, stats) => {
        if (!statError) {
          this.db.loadDatabase({}, (dbError) => {
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
      this.db.saveDatabase((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Creates the Service Properties collection if it does not exist
   *
   * @private
   * @memberof LokiTableMetadataStore
   */
  private createServicePropsCollection() {
    let servicePropertiesColl = this.db.getCollection(this.SERVICES_COLLECTION);
    if (servicePropertiesColl === null) {
      servicePropertiesColl = this.db.addCollection(this.SERVICES_COLLECTION, {
        unique: ["accountName"]
      });
    }
  }

  /**
   * Creates the tables collection if it does not exist
   *
   * @private
   * @memberof LokiTableMetadataStore
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
   * @memberof LokiTableMetadataStore
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
      indices: ["PartitionKey", "RowKey"]
    });
  }

  /**
   * Throws an exception if a table exists
   *
   * @private
   * @param {Collection<any>} coll
   * @param {Table} tableModel
   * @param {Context} context
   * @memberof LokiTableMetadataStore
   */
  private checkIfTableExists(
    coll: Collection<any>,
    tableModel: Table,
    context: Context
  ) {
    const doc = coll.findOne({
      account: tableModel.account,
      table: { $regex: [String.raw`\b${tableModel.table}\b`, "i"] }
    });

    // If the metadata exists, we will throw getTableAlreadyExists error
    if (doc) {
      throw StorageErrorFactory.getTableAlreadyExists(context);
    }
  }

  /**
   * With throw a storage exception if resource not found.
   *
   * @private
   * @param {*} doc
   * @param {Context} context
   * @memberof LokiTableMetadataStore
   */
  private checkIfResourceExists(doc: any, context: Context) {
    if (!doc) {
      throw StorageErrorFactory.ResourceNotFound(context);
    }
  }

  /**
   * Removes a table collection and index when deleting a table.
   *
   * @private
   * @param {string} account
   * @param {*} doc
   * @memberof LokiTableMetadataStore
   */
  private removeTableCollection(account: string, doc: any) {
    const tableCollectionName = this.getTableCollectionName(account, doc.table);
    const tableEntityCollection = this.db.getCollection(tableCollectionName);
    if (tableEntityCollection) {
      this.db.removeCollection(tableCollectionName);
    }
  }

  /**
   * Gets the collection of entities for a specific table.
   * Ensures that table name is case-insensitive.
   *
   * @private
   * @param {string} account
   * @param {string} table
   * @param {Context} context
   * @return {*}  {Collection<any>}
   * @memberof LokiTableMetadataStore
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

  private trackRollback(batchId: string, doc: Entity) {
    if (batchId !== "") {
      this.transactionRollbackTheseEntities.push(doc);
    }
  }

  private checkIfMatchPrecondition(
    etag: string,
    doc: Entity,
    context: Context
  ) {
    if (etag !== "*" && doc.eTag !== etag) {
      throw StorageErrorFactory.getPreconditionFailed(context);
    }
  }

  private checkForMissingEntity(doc: Entity, context: Context) {
    if (!doc) {
      throw StorageErrorFactory.getEntityNotFound(context);
    }
  }

  private getMaxResultsOption(queryOptions: Models.QueryOptions) {
    if (
      undefined === queryOptions.top ||
      null === queryOptions.top ||
      QUERY_RESULT_MAX_NUM < queryOptions.top
    ) {
      return QUERY_RESULT_MAX_NUM;
    }
    return queryOptions.top;
  }

  /**
   * Adjusts the query result for the max results specified in top parameter
   *
   * @private
   * @param {any[]} result
   * @param {number} maxResults
   * @param {*} nextPartitionKeyResponse
   * @param {*} nextRowKeyResponse
   * @return {*}
   * @memberof LokiTableMetadataStore
   */
  private adjustQueryResultforTop(result: any[], maxResults: number) {
    let nextPartitionKeyResponse: string | undefined;
    let nextRowKeyResponse: string | undefined;
    if (result.length > maxResults) {
      const tail = result.pop();
      nextPartitionKeyResponse = this.encodeContinuationHeader(
        tail.PartitionKey
      );
      nextRowKeyResponse = this.encodeContinuationHeader(tail.RowKey);
    }
    return { nextPartitionKeyResponse, nextRowKeyResponse } as const;
  }

  private decodeContinuationHeader(input?: string) {
    if (input !== undefined) {
      return Buffer.from(input, "base64").toString("utf8");
    }
  }

  private encodeContinuationHeader(input?: string) {
    if (input !== undefined) {
      return Buffer.from(input, "utf8").toString("base64");
    }
  }

  private async updateTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    ifMatch?: string,
    batchId?: string
  ): Promise<Entity> {
    const tableEntityCollection = this.getEntityCollection(
      account,
      table,
      context
    );

    const doc = tableEntityCollection.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    }) as Entity;

    if (!doc) {
      throw StorageErrorFactory.getEntityNotFound(context);
    }
    if (batchId !== "") {
      this.transactionRollbackTheseEntities.push(doc);
    }

    // Test if etag value is valid
    const encodedEtag = this.encodeIfMatch(doc.eTag);
    let encodedIfMatch: string | undefined;
    if (ifMatch !== undefined) {
      encodedIfMatch = this.encodeIfMatch(ifMatch);
    }
    if (
      encodedIfMatch === undefined ||
      encodedIfMatch === "*" ||
      (encodedIfMatch !== undefined && encodedEtag === encodedIfMatch)
    ) {
      tableEntityCollection.remove(doc);

      entity.properties.Timestamp = entity.lastModifiedTime;
      entity.properties["Timestamp@odata.type"] = "Edm.DateTime";

      tableEntityCollection.insert(entity);
      return entity;
    }

    throw StorageErrorFactory.getPreconditionFailed(context);
  }

  private async mergeTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    ifMatch?: string,
    batchId?: string
  ): Promise<Entity> {
    const tableEntityCollection = this.getEntityCollection(
      account,
      table,
      context
    );

    const doc = tableEntityCollection.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    }) as Entity;

    if (!doc) {
      throw StorageErrorFactory.getEntityNotFound(context);
    }
    if (batchId !== "") {
      this.transactionRollbackTheseEntities.push(doc);
    }

    // if match is URL encoded from the clients, match URL encoding
    // this does not always seem to be consistent...
    const encodedEtag = this.encodeIfMatch(doc.eTag);
    let encodedIfMatch: string | undefined;
    encodedIfMatch = this.encodeIfMatch(ifMatch);

    if (
      encodedIfMatch === undefined ||
      encodedIfMatch === "*" ||
      (encodedIfMatch !== undefined && encodedEtag === encodedIfMatch)
    ) {
      const mergedEntity: Entity = {
        ...doc,
        ...entity,
        properties: {
          ...doc.properties
          // ...entity.properties
        }
      };

      // Merge inner properties
      for (const key in entity.properties) {
        if (Object.prototype.hasOwnProperty.call(entity.properties, key)) {
          if (key.endsWith(ODATA_TYPE)) {
            continue;
          }

          const value = entity.properties[key];
          mergedEntity.properties[key] = value;

          this.filterOdataMetaData(entity, key, mergedEntity);
        }
      }

      tableEntityCollection.update(mergedEntity);
      return mergedEntity;
    }
    throw StorageErrorFactory.getPreconditionFailed(context);
  }

  private filterOdataMetaData(
    entity: Entity,
    key: string,
    mergedEntity: Entity
  ) {
    if (entity.properties[`${key}${ODATA_TYPE}`] !== undefined) {
      mergedEntity.properties[`${key}${ODATA_TYPE}`] =
        entity.properties[`${key}${ODATA_TYPE}`];
    } else {
      delete mergedEntity.properties[`${key}${ODATA_TYPE}`];
    }
  }

  private encodeIfMatch(ifMatch: string | undefined): string | undefined {
    let encodeIfMatch: string | undefined;
    if (ifMatch !== undefined) {
      encodeIfMatch = ifMatch!.replace(":", "%3A").replace(":", "%3A");
    }
    return encodeIfMatch;
  }

  private getTableCollectionName(account: string, table: string): string {
    return `${account}$${table}`;
  }

  /**
   * Rolls back changes for deleted or modified entities
   *
   * @private
   * @param {Collection<any>} tableBatchCollection
   * @memberof LokiTableMetadataStore
   */
  private rollbackEntityChanges(tableBatchCollection: Collection<any>) {
    for (const entity of this.transactionRollbackTheseEntities) {
      const copiedEntity: Entity = {
        PartitionKey: entity.PartitionKey,
        RowKey: entity.RowKey,
        properties: entity.properties,
        lastModifiedTime: entity.lastModifiedTime,
        eTag: entity.eTag
      };
      // lokijs applies this insert as an upsert
      const doc = tableBatchCollection.findOne({
        PartitionKey: entity.PartitionKey,
        RowKey: entity.RowKey
      });
      // we can't rely on upsert behavior if documents already exist
      if (doc) {
        tableBatchCollection.remove(doc);
      }
      tableBatchCollection.insert(copiedEntity);
    }
  }

  /**
   * Removes entities added to the batch collection
   *
   * @private
   * @param {Collection<any>} tableBatchCollection
   * @memberof LokiTableMetadataStore
   */
  private removeEntitiesAddedInBatch(tableBatchCollection: Collection<any>) {
    for (const deleteRow of this.transactionDeleteTheseEntities) {
      tableBatchCollection.remove(deleteRow);
    }
  }
}
