import { stat } from "fs";
import Loki from "lokijs";

import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { Entity, Table } from "../persistence/ITableMetadataStore";
import { ODATA_TYPE, QUERY_RESULT_MAX_NUM } from "../utils/constants";
import { getTimestampString } from "../utils/utils";
import ITableMetadataStore, { TableACL } from "./ITableMetadataStore";

/** MODELS FOR SERVICE */
interface IServiceAdditionalProperties {
  accountName: string;
}

export type ServicePropertiesModel = Models.TableServiceProperties &
  IServiceAdditionalProperties;

// used by the query filter checking logic
type TokenTuple = [string, TokenType];
enum TokenType {
  Unknown,
  Identifier,
  Comparisson,
  LogicalOp,
  Value,
  Parens
}

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

  public constructor(public readonly lokiDBPath: string) {
    this.db = new Loki(lokiDBPath, {
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
    this.finalizeInitializionState();
  }

  /**
   * Sets variables that track state of initialized DB
   *
   * @private
   * @memberof LokiTableMetadataStore
   */
  private finalizeInitializionState() {
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
    // Azure Storage Service is case insensitive
    tableModel.table = tableModel.table;
    this.checkIfTableExists(coll, tableModel, context);

    coll.insert(tableModel);

    this.createCollectionForTable(tableModel);
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
    // Azure Storage Service is case insensitive
    const tableLower = table.toLocaleLowerCase();
    const doc = coll.findOne({
      account,
      table: { $regex: [tableLower, "i"] }
    });
    this.checkIfResourceExists(doc, context);
    coll.remove(doc);

    this.removeTableCollection(account, doc);
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
    // Azure Storage Service is case insensitive
    const tableLower = table.toLocaleLowerCase();
    const persistedTable = coll.findOne({
      account,
      table: { $regex: [tableLower, "i"] }
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
    // Azure Storage Service is case insensitive
    const doc = coll.findOne({ account, table: { $regex: [table, "i"] } });
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
      queryWhere = this.generateQueryTableWhereFunction(queryOptions.filter);
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

    entity.properties.Timestamp = getTimestampString(entity.lastModifiedTime);
    entity.properties["Timestamp@odata.type"] = "Edm.DateTime";

    if (batchId !== "" && batchId !== undefined) {
      this.transactionDeleteTheseEntities.push(entity);
    }
    tableEntityCollection.insert(entity);
    return entity;
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

  public async insertOrUpdateTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    ifMatch?: string,
    batchId?: string
  ): Promise<Entity> {
    if (ifMatch === undefined || ifMatch === "*") {
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
    if (ifMatch === undefined || ifMatch === "*") {
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
        this.failPatchOnMissingEntity(context);
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

  private failPatchOnMissingEntity(context: Context) {
    if (
      context.context.request.req !== undefined &&
      context.context.request.req.method === "PATCH"
    ) {
      throw StorageErrorFactory.ResourceNotFound(context);
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

    const queryWhere = this.generateQueryForPersistenceLayer(
      queryOptions,
      context
    );

    const maxResults = this.setMaxResults(queryOptions);

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

    let nextPartitionKeyResponse;
    let nextRowKeyResponse;

    ({ nextPartitionKeyResponse, nextRowKeyResponse } =
      this.adjustQueryResultforTop(
        result,
        maxResults,
        nextPartitionKeyResponse,
        nextRowKeyResponse
      ));

    return [result, nextPartitionKeyResponse, nextRowKeyResponse];
  }

  private setMaxResults(queryOptions: Models.QueryOptions) {
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
   * Will throw an exception on invalid query syntax
   *
   * @param queryOptions
   * @param context
   * @returns
   */
  private generateQueryForPersistenceLayer(
    queryOptions: Models.QueryOptions,
    context: Context
  ) {
    let queryWhere;
    try {
      queryWhere = this.generateQueryEntityWhereFunction(queryOptions.filter);
    } catch (e) {
      throw StorageErrorFactory.getQueryConditionInvalid(context);
    }
    return queryWhere;
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
  private adjustQueryResultforTop(
    result: any[],
    maxResults: number,
    nextPartitionKeyResponse: any,
    nextRowKeyResponse: any
  ) {
    if (result.length > maxResults) {
      const tail = result.pop();
      nextPartitionKeyResponse = this.encodeContinuationHeader(
        tail.PartitionKey
      );
      nextRowKeyResponse = this.encodeContinuationHeader(tail.RowKey);
    }
    return { nextPartitionKeyResponse, nextRowKeyResponse };
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
    const encodedEtag = doc.eTag.replace(":", "%3A").replace(":", "%3A");
    let encodedIfMatch: string | undefined;
    if (ifMatch !== undefined) {
      encodedIfMatch = ifMatch!.replace(":", "%3A").replace(":", "%3A");
    }
    if (
      encodedIfMatch === undefined ||
      encodedIfMatch === "*" ||
      (encodedIfMatch !== undefined && encodedEtag === encodedIfMatch)
    ) {
      tableEntityCollection.remove(doc);

      entity.properties.Timestamp = getTimestampString(entity.lastModifiedTime);
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
    const encodedEtag = doc.eTag.replace(":", "%3A").replace(":", "%3A");
    let encodedIfMatch: string | undefined;
    encodedIfMatch = this.unencodeIfMatch(ifMatch, encodedIfMatch);

    if (
      encodedIfMatch === undefined ||
      encodedIfMatch === "*" ||
      (encodedIfMatch !== undefined && encodedEtag === encodedIfMatch)
    ) {
      const mergedDEntity: Entity = {
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
          mergedDEntity.properties[key] = value;

          this.filterOdataMetaData(entity, key, mergedDEntity);
        }
      }

      tableEntityCollection.update(mergedDEntity);
      return mergedDEntity;
    }
    throw StorageErrorFactory.getPreconditionFailed(context);
  }

  private filterOdataMetaData(
    entity: Entity,
    key: string,
    mergedDEntity: Entity
  ) {
    if (entity.properties[`${key}${ODATA_TYPE}`] !== undefined) {
      mergedDEntity.properties[`${key}${ODATA_TYPE}`] =
        entity.properties[`${key}${ODATA_TYPE}`];
    } else {
      delete mergedDEntity.properties[`${key}${ODATA_TYPE}`];
    }
  }

  private unencodeIfMatch(
    ifMatch: string | undefined,
    encodedIfMatch: string | undefined
  ) {
    if (ifMatch !== undefined) {
      encodedIfMatch = ifMatch!.replace(":", "%3A").replace(":", "%3A");
    }
    return encodedIfMatch;
  }

  private getTableCollectionName(account: string, table: string): string {
    return `${account}$${table}`;
  }

  /**
   * Breaks a query into tokens which we use to build the query
   * to the persistence layer.
   *
   * @private
   * @static
   * @param {string} originalQuery
   * @return {*}  {string[]}
   * @memberof LokiTableMetadataStore
   */
  private static tokenizeQuery(originalQuery: string): string[] {
    const query = originalQuery.replace(/`/g, "\\`");

    let tokenStart = 0;
    const tokens: string[] = [];
    let inString = false;
    let i: number;

    for (i = 0; i < query.length; i++) {
      if (inString) {
        // Look for a double quote, inside of a string.
        if (i < query.length - 1 && query[i] === "'" && query[i + 1] === "'") {
          i++;
          continue;
        } else if (query[i] === "'") {
          // prettier-ignore
          [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);
          inString = false;
        }
      } else if (query[i] === "(" || query[i] === ")") {
        if (
          (i !== 0 &&
            (query[i - 1].match(/\S/) !== null ||
              (i >= 5 && query.slice(i - 5, i) === " true") ||
              (i >= 6 && query.slice(i - 6, i) === " false"))) ||
          query.substring(tokenStart, i).match(/\b[0-9]+L\b/g) != null
        ) {
          // this is needed if query does not contain whitespace between number token / boolean and paren
          // prettier-ignore
          [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);
        }
        i--;
        // prettier-ignore
        [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);
        i++;
        tokens.push(query[i]);
        tokenStart++;
      } else if (/\s/.test(query[i])) {
        // prettier-ignore
        [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);
      } else if (query[i] === "'") {
        inString = true;
      }
    }
    // prettier-ignore
    [i, tokenStart] = this.appendToken(i, tokenStart, inString, query, tokens);

    return tokens;
  }

  private static appendToken(
    stringPos: number,
    tokenStart: number,
    inString: boolean,
    query: string,
    tokens: string[]
  ) {
    if (stringPos - tokenStart > 0) {
      let token: string = "";
      if (inString) {
        // Extract the token and unescape quotes
        token = LokiTableMetadataStore.extractAndFormatToken(
          token,
          query,
          tokenStart,
          stringPos
        );
      } else {
        token = LokiTableMetadataStore.convertToken(
          query.substring(tokenStart, stringPos)
        );
      }

      LokiTableMetadataStore.addTokenIfValid(token, tokens);
    }
    tokenStart = stringPos + 1;
    return [stringPos, tokenStart];
  }

  /**
   * Extracts and formats tokens for query function
   *
   * @private
   * @static
   * @param {string} token
   * @param {string} query
   * @param {number} tokenStart
   * @param {number} stringPos
   * @return {*}
   * @memberof LokiTableMetadataStore
   */
  private static extractAndFormatToken(
    token: string,
    query: string,
    tokenStart: number,
    stringPos: number
  ) {
    token = query.substring(tokenStart, stringPos).replace(/''/g, "'");

    // Extract the leading type prefix, if any.
    const stringStart = token.indexOf("'");
    const typePrefix = token.substring(0, stringStart);
    const backtickString = "`" + token.substring(typePrefix.length + 1) + "`";

    token = LokiTableMetadataStore.convertTypeRepresentation(
      typePrefix,
      token,
      backtickString
    );
    return token;
  }

  /**
   * This converts types with base64 representations in the persistence
   * layer to the correct format.
   * i.e. We do this as searching for a Guid Type as a string type should not
   * return a matching Guid.
   *
   * @private
   * @static
   * @param {string} typePrefix
   * @param {string} token
   * @param {string} backtickString
   * @return {*}
   * @memberof LokiTableMetadataStore
   */
  private static convertTypeRepresentation(
    typePrefix: string,
    token: string,
    backtickString: string
  ) {
    if (
      typePrefix === "guid" ||
      typePrefix === "binary" ||
      typePrefix === "X"
    ) {
      const conversionBuffer = Buffer.from(
        token.substring(typePrefix.length + 1)
      );
      token = "`" + conversionBuffer.toString("base64") + "`";
    } else {
      token = typePrefix + backtickString;
    }
    return token;
  }

  private static addTokenIfValid(token: string, tokens: string[]) {
    if (token) {
      tokens.push(token);
    }
  }

  /**
   * Converts a token from query request to a type used in persistence
   * layer query function.
   *
   * @private
   * @static
   * @param {string} token
   * @return {*}  {string}
   * @memberof LokiTableMetadataStore
   */
  private static convertToken(token: string): string {
    switch (token) {
      case "TableName":
        return "name";
      case "eq":
        return "===";
      case "gt":
        return ">";
      case "ge":
        return ">=";
      case "lt":
        return "<";
      case "le":
        return "<=";
      case "ne":
        return "!==";
      case "and":
        return "&&";
      case "or":
        return "||";
      case "not":
        return "!";
      default:
        return token;
    }
  }

  /**
   * @param query Query Tables $query string.
   */
  private generateQueryTableWhereFunction(
    query: string | undefined
  ): (entity: Table) => boolean {
    if (query === undefined) {
      return () => true;
    }

    const transformedQuery = LokiTableMetadataStore.transformTableQuery(query);

    return new Function("item", transformedQuery) as any;
  }

  /**
   * Azurite V2 query tables implementation.
   */
  public static transformTableQuery(query: string): string {
    const systemProperties: Map<string, string> = new Map<string, string>([
      ["name", "table"]
    ]);
    const allowCustomProperties = false;

    return LokiTableMetadataStore.transformQuery(
      query,
      systemProperties,
      allowCustomProperties
    );
  }

  /**
   * @param query Query Enties $query string.
   */
  private generateQueryEntityWhereFunction(
    query: string | undefined
  ): (entity: Entity) => boolean {
    if (query === undefined) {
      return () => true;
    }

    const transformedQuery = LokiTableMetadataStore.transformEntityQuery(query);

    return new Function("item", transformedQuery) as any;
  }

  /**
   * Azurite V2 query entities implementation as temporary workaround before new refactored implementation of querying.
   * TODO: Handle query types
   */
  public static transformEntityQuery(query: string): string {
    const systemProperties: Map<string, string> = new Map<string, string>([
      ["PartitionKey", "PartitionKey"],
      ["RowKey", "RowKey"]
    ]);
    const allowCustomProperties = true;

    return LokiTableMetadataStore.transformQuery(
      query,
      systemProperties,
      allowCustomProperties
    );
  }

  private static transformQuery(
    query: string,
    systemProperties: Map<string, string>,
    allowCustomProperties: boolean
  ): string {
    // If a token is neither a number, nor a boolean, nor a string enclosed with quotation marks it is an operand.
    // Operands are attributes of the object used within the where clause of LokiJS, thus we need to prepend each
    // attribute with an object identifier 'item.attribs'.
    let transformedQuery = "return ( ";
    let isOp = false;
    let previousIsOp = false;
    const tokens = LokiTableMetadataStore.tokenizeQuery(query);

    const tokenTuples: TokenTuple[] = [];
    for (const token of tokens) {
      tokenTuples.push([token, TokenType.Unknown]);
    }
    let counter = -1;
    for (const token of tokenTuples) {
      counter++;
      if (token[0] === "") {
        continue;
      }
      if (token[0].match(/\b\d+/)) {
        token[1] = TokenType.Value;
      }
      previousIsOp = isOp;
      isOp = ["===", ">", ">=", "<", "<=", "!=="].includes(token[0]);
      if (isOp) {
        token[1] = TokenType.LogicalOp;
      }
      if ([")", "("].includes(token[0])) {
        token[1] = TokenType.Parens;
      }
      if (["&&", "||"].includes(token[0])) {
        token[1] = TokenType.Comparisson;
      }
      if (["`", "'", '"'].includes(token[0].charAt(0))) {
        token[1] = TokenType.Value;
      }
      if (
        !token[0].match(/\b\d+/) &&
        token[0] !== "true" &&
        token[0] !== "false" &&
        !token[0].includes("`") &&
        ![
          "===",
          ">",
          ">=",
          "<",
          "<=",
          "!==",
          "&&",
          "||",
          "!",
          "(",
          ")"
        ].includes(token[0])
      ) {
        if (systemProperties.has(token[0])) {
          transformedQuery += `item.${systemProperties.get(token[0])} `;
          token[1] = TokenType.Identifier;
        } else if (allowCustomProperties) {
          // Datetime compare
          if (
            counter + 2 <= tokens.length - 1 &&
            tokens[counter + 2].startsWith("datetime")
          ) {
            transformedQuery += `new Date(item.properties.${token[0]}).getTime() `;
            token[1] = TokenType.Identifier;
          } else {
            transformedQuery += `item.properties.${token[0]} `;
            token[1] = TokenType.Identifier;
          }
        } else {
          throw Error(
            "Custom properties are not supported on this query type."
          );
        }
      } else {
        // Remove "L" from long int
        // 2039283L ==> 2039283
        const matchLongInt = token[0].match(/\b[0-9]*L\b/g);
        if (
          previousIsOp &&
          matchLongInt !== null &&
          matchLongInt.length === 1
        ) {
          const newtoken = token[0].slice(0, token[0].length - 1);
          // however, as long int is stored as string, we need to add inverted commas
          token[0] = "'" + newtoken + "'";
          token[1] = TokenType.Value;
        } else if (previousIsOp && token[0].startsWith("datetime")) {
          token[0] = token[0].replace(/\bdatetime\b/g, "");
          token[0] = `new Date(${token[0]}).getTime()`;
          token[1] = TokenType.Value;
        } else if (
          previousIsOp &&
          (token[0].startsWith("X") || token[0].startsWith("binary"))
        ) {
          throw Error("Binary filter is not supported yet.");
        }

        transformedQuery += `${token[0]} `;
      }
    }
    transformedQuery += ")";

    // we need to validate that the filter has some valide predicate logic
    // simply we check if we have sequence identifier > op > value through the tokens
    validatePredicateSequence(tokenTuples);

    return transformedQuery;
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
      throw new Error("Transaction Overlapp!");
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

/**
 * Checks that a filter expression conforms to a minimum predicate
 * style logic.
 * It is easier to follow the predicate test logic like this than to
 * manage a state machine during the creation of the query function.
 * Should we continue to have to support more complex query validation
 * we shall implement a query validation state machine.
 *
 * @param {string[]} tokens
 */
function validatePredicateSequence(tokens: TokenTuple[]) {
  if (tokens.length < 3) {
    throw Error("Invalid filter string detected!");
  }
  let foundPredicate: boolean = false;
  let state: TokenType = TokenType.Unknown;
  let lastState: TokenType = tokens[0][1];
  // base case for duplicated token types
  for (let i = 1; i < tokens.length; i++) {
    state = tokens[i][1];
    if (state === TokenType.LogicalOp) {
      foundPredicate = true;
    }
    if (
      state !== TokenType.Unknown &&
      state !== TokenType.Parens &&
      state === lastState
    ) {
      throw Error("Invalid filter string detected!");
    }
    if (lastState === TokenType.Comparisson && state === TokenType.Value) {
      throw Error("Invalid token after comparisson operator");
    }
    if (
      lastState === TokenType.Value &&
      state !== TokenType.Unknown &&
      state !== TokenType.Parens &&
      state !== TokenType.Comparisson
    ) {
      throw Error("Invalid token after value");
    }
    lastState = state;
  }
  if (foundPredicate === false) {
    throw Error("No predicate clause found");
  }
}
