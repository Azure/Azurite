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

  public async init(): Promise<void> {
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

    // Create tables collection if not exists
    if (this.db.getCollection(this.TABLES_COLLECTION) === null) {
      this.db.addCollection(this.TABLES_COLLECTION, {
        // Optimization for indexing and searching
        // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
        indices: ["account", "table"]
      }); // Optimize for find operation
    }

    // Create service properties collection if not exists
    let servicePropertiesColl = this.db.getCollection(this.SERVICES_COLLECTION);
    if (servicePropertiesColl === null) {
      servicePropertiesColl = this.db.addCollection(this.SERVICES_COLLECTION, {
        unique: ["accountName"]
      });
    }

    await new Promise<void>((resolve, reject) => {
      this.db.saveDatabase((err) => {
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

  public async createTable(context: Context, tableModel: Table): Promise<void> {
    // Check for table entry in the table registry collection
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
    // Azure Storage Service is case insensitive
    tableModel.table = tableModel.table;
    const doc = coll.findOne({
      account: tableModel.account,
      table: { $regex: [String.raw`\b${tableModel.table}\b`, "i"] }
    });

    // If the metadata exists, we will throw getTableAlreadyExists error
    if (doc) {
      throw StorageErrorFactory.getTableAlreadyExists(context);
    }

    coll.insert(tableModel);

    // now we create the collection to represent the table using a unique string
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
    }); // Optimize for find operation
  }

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
    if (doc) {
      coll.remove(doc);
    } else {
      throw StorageErrorFactory.ResourceNotFound(context);
    }

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

      if (!doc) {
        throw StorageErrorFactory.getEntityNotFound(context);
      } else {
        if (etag !== "*" && doc.eTag !== etag) {
          throw StorageErrorFactory.getPreconditionFailed(context);
        }
      }
      if (batchId !== "") {
        this.transactionRollbackTheseEntities.push(doc);
      }
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

    let queryWhere;
    try {
      queryWhere = this.generateQueryEntityWhereFunction(queryOptions.filter);
    } catch (e) {
      throw StorageErrorFactory.getQueryConditionInvalid(context);
    }

    const maxResults = queryOptions.top || QUERY_RESULT_MAX_NUM;

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

    let nextPartitionKeyResponse;
    let nextRowKeyResponse;

    if (result.length > maxResults) {
      const tail = result.pop();
      nextPartitionKeyResponse = this.encodeContinuationHeader(
        tail.PartitionKey
      );
      nextRowKeyResponse = this.encodeContinuationHeader(tail.RowKey);
    }

    return [result, nextPartitionKeyResponse, nextRowKeyResponse];
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
    if (ifMatch !== undefined) {
      encodedIfMatch = ifMatch!.replace(":", "%3A").replace(":", "%3A");
    }
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

          if (entity.properties[`${key}${ODATA_TYPE}`] !== undefined) {
            mergedDEntity.properties[`${key}${ODATA_TYPE}`] =
              entity.properties[`${key}${ODATA_TYPE}`];
          } else {
            delete mergedDEntity.properties[`${key}${ODATA_TYPE}`];
          }
        }
      }

      tableEntityCollection.update(mergedDEntity);
      return mergedDEntity;
    } else {
      throw StorageErrorFactory.getPreconditionFailed(context);
    }
  }

  private getTableCollectionName(account: string, table: string): string {
    return `${account}$${table}`;
  }

  private static tokenizeQuery(originalQuery: string): string[] {
    // Escape a single backtick to prevent interpreting the start of a template literal.
    const query = originalQuery.replace(/`/g, "\\`");

    let tokenStart = 0;
    const tokens: string[] = [];
    let inString = false;
    let i: number;

    function appendToken() {
      if (i - tokenStart > 0) {
        let token: string;
        if (inString) {
          // Extract the token and unescape quotes
          token = query.substring(tokenStart, i).replace(/''/g, "'");

          // Extract the leading type prefix, if any.
          const stringStart = token.indexOf("'");
          const typePrefix = token.substring(0, stringStart);
          const backtickString =
            "`" + token.substring(typePrefix.length + 1) + "`";

          // Remove the GUID type prefix since we compare these as strings
          if (typePrefix === "guid") {
            token = backtickString;
          } else {
            token = typePrefix + backtickString;
          }
        } else {
          token = convertToken(query.substring(tokenStart, i));
        }

        if (token) {
          tokens.push(token);
        }
      }
      tokenStart = i + 1;
    }

    function convertToken(token: string): string {
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

    for (i = 0; i < query.length; i++) {
      if (inString) {
        // Look for a double quote, inside of a string.
        if (i < query.length - 1 && query[i] === "'" && query[i + 1] === "'") {
          i++;
          continue;
        } else if (query[i] === "'") {
          appendToken();
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
          appendToken();
        }
        i--;
        appendToken();
        i++;
        tokens.push(query[i]);
        tokenStart++;
      } else if (/\s/.test(query[i])) {
        appendToken();
      } else if (query[i] === "'") {
        inString = true;
      }
    }

    appendToken();

    return tokens;
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

    // tslint:disable-next-line: no-console
    // console.log(query);
    // tslint:disable-next-line: no-console
    // console.log(transformedQuery);

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
   *
   * @param {ServicePropertiesModel} serviceProperties
   * @returns {Promise<ServicePropertiesModel>} undefined properties will be ignored during properties setup
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

  public async beginBatchTransaction(batchId: string): Promise<void> {
    // instead of copying all entities / rows in the collection,
    // we shall just backup those rows that we change
    // Keeping the batchId in the interface to allow logging scenarios to extend
    if (
      this.transactionRollbackTheseEntities.length > 0 ||
      this.transactionDeleteTheseEntities.length > 0
    ) {
      throw new Error("Transaction Overlapp!");
    }
  }

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
        // for entities deleted or modified
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

        // for entities added to the collection
        for (const deleteRow of this.transactionDeleteTheseEntities) {
          tableBatchCollection.remove(deleteRow);
        }
      }
    }
    // reset entity rollback trackers
    this.transactionRollbackTheseEntities = [];
    this.transactionDeleteTheseEntities = [];
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
