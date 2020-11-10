import { stat } from "fs";
import Loki from "lokijs";

import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { Entity, Table } from "../persistence/ITableMetadataStore";
import {
  QUERY_RESULT_MAX_NUM
  // SUPPORTED_QUERY_OPERATOR
} from "../utils/constants";
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
    if (this.db.getCollection(this.TABLES_COLLECTION) === null) {
      this.db.addCollection(this.TABLES_COLLECTION, {
        // Optimization for indexing and searching
        // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
        indices: ["account", "table"]
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

  public async queryTable(context: Context, account: string): Promise<Table[]> {
    const coll = this.db.getCollection(this.TABLES_COLLECTION);
    const docList = coll.find({ account });

    if (!docList) {
      throw StorageErrorFactory.getEntityNotFound(context);
    }

    return docList;
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

    // Split parameters for filter
    // const queryFilter = {};
    // if (queryOptions.filter) {
    //   const filters = queryOptions.filter!.split("and");
    //   for (let condition of filters) {
    //     condition = condition.trim();
    //     const length = condition.length;

    //     // Remove wrapping parentheses
    //     if (condition[0] === "(" && condition[length - 1] === ")") {
    //       condition = condition.substr(1, length - 2);
    //     }

    //     const comps = condition.split(" ");
    //     // if (comps.length !== 3) {
    //     //   throw StorageErrorFactory.getQueryConditionInvalid(context);
    //     // }

    //     let operator = comps[1];
    //     const firstParam = "properties." + comps[0];
    //     let secondParam = comps[2];

    //     if (SUPPORTED_QUERY_OPERATOR.indexOf(operator) >= 0) {
    //       const rightExpressionJSON = {};

    //       // Fix inconsistency with azure table query operator
    //       //    and lokijs query operator
    //       if (operator === "ge") {
    //         operator = "gte";
    //       }

    //       if (operator === "le") {
    //         operator = "lte";
    //       }

    //       operator = "$" + operator;
    //       secondParam = this.convertQueryParameters(secondParam, context);

    //       (rightExpressionJSON as any)[operator] = secondParam;
    //       (queryFilter as any)[firstParam] = rightExpressionJSON;
    //     } else {
    //       throw StorageErrorFactory.getQueryConditionInvalid(context);
    //     }
    //   }
    // }

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
      segmentFilter.RowKey = { $gte: nextPartitionKey };
    }

    const maxResults = queryOptions.top || QUERY_RESULT_MAX_NUM;

    const result = tableEntityCollection
      .chain()
      .find(segmentFilter)
      .where(queryWhere)
      .limit(maxResults + 1)
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
      .data();

    let nextPartitionKeyResponse;
    let nextRowKeyResponse;

    if (result.length > maxResults) {
      const tail = result[result.length - 1];
      nextPartitionKeyResponse = tail.PartitionKey;
      nextRowKeyResponse = tail.RowKey;
      result.pop();
    }

    const selectedResult = result;

    // Only return selected fields
    // if (queryOptions.select !== undefined) {
    //   const selectedFieldsResult = [];
    //   const selectedFields = queryOptions.select.split(",");

    //   // Iterate all entities and get selected fields
    //   for (const entity of result) {
    //     // Check if the selected result has exceeded the top limits
    //     const entitySelectedFieldResult = {};
    //     (entitySelectedFieldResult as any).PartitionKey = entity.PartitionKey;
    //     (entitySelectedFieldResult as any).RowKey = entity.RowKey;
    //     (entitySelectedFieldResult as any).odataMetadata = entity.odataMetadata;
    //     (entitySelectedFieldResult as any).odataType = entity.odataType;
    //     (entitySelectedFieldResult as any).odataId = entity.odataId;
    //     (entitySelectedFieldResult as any).odataEditLink = entity.odataEditLink;
    //     (entitySelectedFieldResult as any).eTag = entity.eTag;
    //     (entitySelectedFieldResult as any).Timestamp = entity.lastModifiedTime;

    //     for (let field of selectedFields) {
    //       field = field.trim();
    //       const keys = field.split(".");
    //       let val = entity.properties;
    //       for (const key of keys) {
    //         val = val[key];
    //       }
    //       (entitySelectedFieldResult as any)[field] = val;
    //       (entitySelectedFieldResult as any)[
    //         field + "@odata.type"
    //       ] = this.getODataType(val);
    //     }

    //     // Add to result
    //     selectedFieldsResult.push(entitySelectedFieldResult);
    //   }

    //   selectedResult = selectedFieldsResult;
    // }

    return [selectedResult, nextPartitionKeyResponse, nextRowKeyResponse];
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
          // TODO: Validate incoming odata types
          ...doc.properties,
          ...entity.properties,
          Timestamp: getTimestampString(entity.lastModifiedTime),
          "Timestamp@odata.type": "Edm.DateTime"
        },
        lastModifiedTime: context.startTime!
      };
      tableEntityCollection.update(mergedDEntity);
      return mergedDEntity;
    } else {
      throw StorageErrorFactory.getPreconditionFailed(context);
    }
  }

  private getTableCollectionName(account: string, table: string): string {
    return `${account}$${table}`;
  }

  // private convertQueryParameters(param: string, context: Context): any {
  //   const length = param.length;
  //   if (param[0] === "'" && param[length - 1] === "'") {
  //     // Param is of type string
  //     // Convert middle '' to '
  //     const idx = param.indexOf("''");
  //     if (idx > 0) {
  //       param = param.substr(0, idx) + param.substr(idx + 1, length);
  //     }
  //     return param.substr(1, param.length - 2);
  //   }

  //   if (param === "true" || param === "false") {
  //     // Param is of type boolean
  //     return param === "true";
  //   }

  //   const floatVal = parseFloat(param);
  //   const intVal = parseInt(param, 10);

  //   if (!isNaN(floatVal)) {
  //     if (intVal === floatVal) {
  //       return intVal;
  //     } else {
  //       return floatVal;
  //     }
  //   } else {
  //     throw StorageErrorFactory.getQueryConditionInvalid(context);
  //   }
  // }

  // private getODataType(val: any) {
  //   switch (typeof val) {
  //     case "string": {
  //       return "Edm.String";
  //     }
  //     case "number": {
  //       if (Number.isInteger(val)) {
  //         return "Edm.Int32";
  //       } else {
  //         return "Edm.Float";
  //       }
  //     }
  //     case "boolean": {
  //       return "Edm.Boolean";
  //     }
  //   }

  //   if (val instanceof Date) {
  //     return "Edm.DateTime";
  //   }
  // }

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
      .replace(/\bdatetime\b/g, "")
      .replace(/\binary\b/g, "")
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
    for (const token of filter.split(" ")) {
      if (token === "") {
        continue;
      }
      if (
        !token.match(/\d+/) &&
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
          transformedQuery += `item.properties.${token} `;
        }
      } else {
        transformedQuery += `${token} `;
      }
    }
    transformedQuery += ")";

    return new Function("item", transformedQuery) as any;
  }
}
