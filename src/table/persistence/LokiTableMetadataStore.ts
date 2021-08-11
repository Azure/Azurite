import { stat } from "fs";
import Loki from "lokijs";

import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { Entity, Table } from "../persistence/ITableMetadataStore";
import { ODATA_TYPE, QUERY_RESULT_MAX_NUM } from "../utils/constants";
import { getTimestampString } from "../utils/utils";
import ITableMetadataStore, {
  TableACL
} from "./ITableMetadataStore";

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
    const doc = coll.findOne({
      account: tableModel.account,
      table: tableModel.table
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
    const doc = coll.findOne({
      account,
      table
    });
    if (doc) {
      coll.remove(doc);
    } else {
      throw StorageErrorFactory.ResourceNotFound(context);
    }

    const tableCollectionName = this.getTableCollectionName(account, table);
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
    const doc = coll.findOne({ account, table });

    if (!doc) {
      throw StorageErrorFactory.getTableNotFound(context);
    }

    doc.tableAcl = tableACL;
    coll.update(doc);
  }

  public async getTable(
    account: string,
    table: string,
    context: Context
  ): Promise<Table> {
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
    const doc = coll.findOne({ account, table });
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
    entity: Entity
  ): Promise<Entity> {
    const tablesCollection = this.db.getCollection(this.TABLES_COLLECTION);
    const tableDocument = tablesCollection.findOne({
      account,
      table
    });
    if (!tableDocument) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    const tableEntityCollection = this.db.getCollection(
      this.getTableCollectionName(account, table)
    );
    if (!tableEntityCollection) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    const doc = tableEntityCollection.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    });
    if (doc) {
      throw StorageErrorFactory.getEntityAlreadyExist(context);
    }

    entity.properties.Timestamp = getTimestampString(entity.lastModifiedTime);
    entity.properties["Timestamp@odata.type"] = "Edm.DateTime";

    tableEntityCollection.insert(entity);
    return entity;
  }

  public async insertOrUpdateTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    ifMatch?: string
  ): Promise<Entity> {
    if (ifMatch === undefined) {
      // Upsert
      const existingEntity = await this.queryTableEntitiesWithPartitionAndRowKey(
        context,
        table,
        account,
        entity.PartitionKey,
        entity.RowKey
      );

      if (existingEntity) {
        // Update
        return this.updateTableEntity(context, table, account, entity, ifMatch);
      } else {
        // Insert
        return this.insertTableEntity(context, table, account, entity);
      }
    } else {
      // Update
      return this.updateTableEntity(context, table, account, entity, ifMatch);
    }

    // const tablesCollection = this.db.getCollection(this.TABLES_COLLECTION);
    // const tableDocument = tablesCollection.findOne({
    //   account,
    //   table
    // });
    // if (!tableDocument) {
    //   throw StorageErrorFactory.getTableNotExist(context);
    // }

    // const tableEntityCollection = this.db.getCollection(
    //   this.getTableCollectionName(account, table)
    // );
    // if (!tableEntityCollection) {
    //   throw StorageErrorFactory.getTableNotExist(context);
    // }

    // const doc = tableEntityCollection.findOne({
    //   PartitionKey: entity.PartitionKey,
    //   RowKey: entity.RowKey
    // }) as Entity;

    // if (!doc) {
    //   throw StorageErrorFactory.getEntityNotExist(context);
    // } else {
    //   // Test if etag value is valid
    //   if (ifMatch === "*" || doc.eTag === ifMatch) {
    //     tableEntityCollection.remove(doc);

    //     entity.properties.Timestamp = getTimestampString(
    //       entity.lastModifiedTime
    //     );
    //     entity.properties["Timestamp@odata.type"] = "Edm.DateTime";

    //     tableEntityCollection.insert(entity);
    //     return;
    //   }
    // }

    // throw StorageErrorFactory.getPreconditionFailed(context);
  }

  public async insertOrMergeTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    ifMatch?: string
  ): Promise<Entity> {
    if (ifMatch === undefined) {
      // Upsert
      const existingEntity = await this.queryTableEntitiesWithPartitionAndRowKey(
        context,
        table,
        account,
        entity.PartitionKey,
        entity.RowKey
      );

      if (existingEntity) {
        // Merge
        return this.mergeTableEntity(context, table, account, entity, ifMatch);
      } else {
        // Insert
        return this.insertTableEntity(context, table, account, entity);
      }
    } else {
      // Merge
      return this.mergeTableEntity(context, table, account, entity, ifMatch);
    }

    // const tablesCollection = this.db.getCollection(this.TABLES_COLLECTION);
    // const tableDocument = tablesCollection.findOne({
    //   account,
    //   table
    // });
    // if (!tableDocument) {
    //   throw StorageErrorFactory.getTableNotExist(context);
    // }

    // const tableEntityCollection = this.db.getCollection(
    //   this.getTableCollectionName(account, table)
    // );
    // if (!tableEntityCollection) {
    //   throw StorageErrorFactory.getTableNotExist(context);
    // }

    // const doc = tableEntityCollection.findOne({
    //   PartitionKey: entity.PartitionKey,
    //   RowKey: entity.RowKey
    // }) as Entity;

    // if (!doc) {
    //   throw StorageErrorFactory.getEntityNotExist(context);
    // } else {
    //   // Test if etag value is valid
    //   if (ifMatch === "*" || doc.eTag === ifMatch) {
    //     const mergedDEntity: Entity = {
    //       ...doc,
    //       ...entity,
    //       properties: {
    //         // TODO: Validate incoming odata types
    //         ...doc.properties,
    //         ...entity.properties,
    //         Timestamp: getTimestampString(entity.lastModifiedTime),
    //         "Timestamp@odata.type": "Edm.DateTime"
    //       },
    //       lastModifiedTime: context.startTime!
    //     };
    //     tableEntityCollection.remove(doc);
    //     tableEntityCollection.insert(mergedDEntity);
    //     return mergedDEntity;
    //   }
    // }
    // throw StorageErrorFactory.getPreconditionFailed(context);
  }

  public async deleteTableEntity(
    context: Context,
    table: string,
    account: string,
    partitionKey: string,
    rowKey: string,
    etag: string
  ): Promise<void> {
    const tablesCollection = this.db.getCollection(this.TABLES_COLLECTION);
    const tableDocument = tablesCollection.findOne({
      account,
      table
    });
    if (!tableDocument) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    const tableEntityCollection = this.db.getCollection(
      this.getTableCollectionName(account, table)
    );
    if (!tableEntityCollection) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

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
    const tablesCollection = this.db.getCollection(this.TABLES_COLLECTION);
    const tableDocument = tablesCollection.findOne({
      account,
      table
    });
    if (!tableDocument) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    const tableEntityCollection = this.db.getCollection(
      this.getTableCollectionName(account, table)
    );
    if (!tableEntityCollection) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    let queryWhere;
    try {
      queryWhere = this.generateQueryEntityWhereFunction(queryOptions.filter);
    } catch (e) {
      throw StorageErrorFactory.getQueryConditionInvalid(context);
    }

    const maxResults = queryOptions.top || QUERY_RESULT_MAX_NUM;

    // .find using a segment filter is not filtering in the same way that the sorting function sorts
    // I think offset will cause more problems than it solves, as we will have to step and sort all
    // results here, so I am adding 2 additional predicates here to cover the cases with
    // multiple partitions and rows to paginate
    const result = tableEntityCollection
      .chain()
      .where(queryWhere)
      .where((data: any) => {
        if (nextRowKey !== undefined) {
          return data.RowKey >= nextRowKey;
        }
        return true;
      })
      .where((data: any) => {
        if (nextPartitionKey !== undefined) {
          return data.PartitionKey >= nextPartitionKey;
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
      nextPartitionKeyResponse = tail.PartitionKey;
      nextRowKeyResponse = tail.RowKey;
    }

    return [result, nextPartitionKeyResponse, nextRowKeyResponse];
  }

  public async queryTableEntitiesWithPartitionAndRowKey(
    context: Context,
    table: string,
    account: string,
    partitionKey: string,
    rowKey: string
  ): Promise<Entity | undefined> {
    const tableColl = this.db.getCollection(
      this.getTableCollectionName(account, table)
    );

    // Throw error, if table not exists
    if (!tableColl) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    // Get requested Doc
    const requestedDoc = tableColl.findOne({
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
    ifMatch?: string
  ): Promise<Entity> {
    const tablesCollection = this.db.getCollection(this.TABLES_COLLECTION);
    const tableDocument = tablesCollection.findOne({
      account,
      table
    });
    if (!tableDocument) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    const tableEntityCollection = this.db.getCollection(
      this.getTableCollectionName(account, table)
    );
    if (!tableEntityCollection) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    const doc = tableEntityCollection.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    }) as Entity;

    if (!doc) {
      throw StorageErrorFactory.getEntityNotFound(context);
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
    ifMatch?: string
  ): Promise<Entity> {
    const tablesCollection = this.db.getCollection(this.TABLES_COLLECTION);
    const tableDocument = tablesCollection.findOne({
      account,
      table
    });
    if (!tableDocument) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    const tableEntityCollection = this.db.getCollection(
      this.getTableCollectionName(account, table)
    );
    if (!tableEntityCollection) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    const doc = tableEntityCollection.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    }) as Entity;

    if (!doc) {
      throw StorageErrorFactory.getEntityNotFound(context);
    }

    // if match is URL encoded from the clients, match URL encoding
    // this does not always seem to be consisten...
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
        if (i !== 0 && query[i - 1].match(/\d/) !== null) {
          // this is needed if query does not contain whitespace between number token and paren
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

    // tslint:disable-next-line: no-console
    // console.log(query);
    // tslint:disable-next-line: no-console
    // console.log(transformedQuery);

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
    let counter = -1;
    for (let token of tokens) {
      counter++;
      if (token === "") {
        continue;
      }

      previousIsOp = isOp;
      isOp = ["===", ">", ">=", "<", "<=", "!=="].includes(token);

      if (
        !token.match(/\b\d+/) &&
        token !== "true" &&
        token !== "false" &&
        !token.includes("`") &&
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
        ].includes(token)
      ) {
        if (systemProperties.has(token)) {
          transformedQuery += `item.${systemProperties.get(token)} `;
        } else if (allowCustomProperties) {
          // Datetime compare
          if (
            counter + 2 <= tokens.length - 1 &&
            tokens[counter + 2].startsWith("datetime")
          ) {
            transformedQuery += `new Date(item.properties.${token}).getTime() `;
          } else {
            transformedQuery += `item.properties.${token} `;
          }
        } else {
          throw Error(
            "Custom properties are not supported on this query type."
          );
        }
      } else {
        // Remove "L" from long int
        // 2039283L ==> 2039283
        const matchLongInt = token.match(/\b[0-9]*L\b/g);
        if (
          previousIsOp &&
          matchLongInt !== null &&
          matchLongInt.length === 1
        ) {
          token = token.replace(/L\b/g, "");
          // however, as long int is stored as string, we need to add inverted commas
          token = "'" + token + "'";
        } else if (previousIsOp && token.startsWith("datetime")) {
          token = token.replace(/\bdatetime\b/g, "");
          token = `new Date(${token}).getTime()`;
        } else if (
          previousIsOp &&
          (token.startsWith("X") || token.startsWith("binary"))
        ) {
          throw Error("Binary filter is not supported yet.");
        }

        transformedQuery += `${token} `;
      }
    }
    transformedQuery += ")";

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
}
