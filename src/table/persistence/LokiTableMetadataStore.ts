import { stat } from "fs";
import Loki from "lokijs";

import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { Entity, Table } from "../persistence/ITableMetadataStore";
import { ODATA_TYPE, QUERY_RESULT_MAX_NUM } from "../utils/constants";
import { getTimestampString } from "../utils/utils";
import ITableMetadataStore from "./ITableMetadataStore";

export default class LokiTableMetadataStore implements ITableMetadataStore {
  private readonly db: Loki;
  private readonly TABLES_COLLECTION = "$TABLES_COLLECTION$";
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

    await new Promise((resolve, reject) => {
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
      throw StorageErrorFactory.getTableNotFound(context);
    }

    const tableCollectionName = this.getTableCollectionName(account, table);
    const tableEntityCollection = this.db.getCollection(tableCollectionName);
    if (tableEntityCollection) {
      this.db.removeCollection(tableCollectionName);
    }
  }

  public async queryTable(
    context: Context,
    account: string,
    top: number = 1000,
    nextTable?: string
  ): Promise<[Table[], string | undefined]> {
    const coll = this.db.getCollection(this.TABLES_COLLECTION);

    const filter = { account } as any;
    if (nextTable) {
      filter.table = { $gte: nextTable };
    }

    const docList = coll
      .chain()
      .find(filter)
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

    const segmentFilter = {} as any;
    if (nextPartitionKey) {
      segmentFilter.PartitionKey = { $gte: nextPartitionKey };
    }
    if (nextRowKey) {
      segmentFilter.RowKey = { $gte: nextRowKey };
    }

    const maxResults = queryOptions.top || QUERY_RESULT_MAX_NUM;

    const result = tableEntityCollection
      .chain()
      .find(segmentFilter)
      .where(queryWhere)
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
    throw new NotImplementedError();
  }

  public async setTableAccessPolicy(
    context: Context,
    table: string
  ): Promise<Models.TableSetAccessPolicyResponse> {
    // TODO
    throw new NotImplementedError();
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
      throw StorageErrorFactory.getEntityNotExist(context);
    }

    // Test if etag value is valid
    if (ifMatch === undefined || ifMatch === "*" || doc.eTag === ifMatch) {
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
      throw StorageErrorFactory.getEntityNotExist(context);
    }

    if (ifMatch === undefined || ifMatch === "*" || doc.eTag === ifMatch) {
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

  /**
   * Azurite V2 query entities implementation as temporary workaround before new refactored implementation of querying.
   * TODO: Handle query types
   *
   * @param query Query Enties $query string.
   */
  private generateQueryEntityWhereFunction(
    query: string | undefined
  ): (entity: Entity) => boolean {
    if (query === undefined) {
      return () => true;
    }

    const filter = query
      // ignoring these query keywords since we compare simply on a string-level
      // .replace(/\bbinary\b/g, "")
      .replace(/\bguid\b/g, "")
      // Escape a single backtick to prevent interpreting the start of a template literal.
      .replace(/`/g, "\\`")
      // A simple quotation mark is escaped with another one (i.e. '').
      // Since we will evaluate this string we replace simple quotation marks
      // indictaing strings with template quotation marks
      .replace(/''/g, "@ESCAPEDQUOTE@")
      .replace(/'/g, "`")
      .replace(/@ESCAPEDQUOTE@/g, `'`)
      // Mapping 'TableName' to 'name' which is used internally as attribute name
      .replace(/\bTableName\b/g, "name")
      // Mapping operators
      .replace(/\beq\b/g, "===")
      .replace(/\bgt\b/g, ">")
      .replace(/\bge\b/g, ">=")
      .replace(/\blt\b/g, "<")
      .replace(/\ble\b/g, "<=")
      .replace(/\bne\b/g, "!==")
      .replace(/\band\b/g, "&&")
      .replace(/\bor\b/g, "||")
      .replace(/\(/g, " ( ")
      .replace(/\)/g, " ) ")
      .replace(/\bnot\b/g, " ! ");

    // If a token is neither a number, nor a boolean, nor a string enclosed with quotation marks it is an operand.
    // Operands are attributes of the object used within the where clause of LokiJS, thus we need to prepend each
    // attribute with an object identifier 'item.attribs'.
    let transformedQuery = "return ( ";
    let isOp = false;
    let previousIsOp = false;
    const tokens = filter.split(" ");
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
        if (token === "PartitionKey" || token === "RowKey") {
          transformedQuery += `item.${token} `;
        } else {
          // Datetime compare
          if (
            counter + 2 <= tokens.length - 1 &&
            tokens[counter + 2].startsWith("datetime")
          ) {
            transformedQuery += `new Date(item.properties.${token}).getTime() `;
          } else {
            transformedQuery += `item.properties.${token} `;
          }
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

    // tslint:disable-next-line: no-console
    console.log(query);
    // tslint:disable-next-line: no-console
    console.log(transformedQuery);

    return new Function("item", transformedQuery) as any;
  }
}
