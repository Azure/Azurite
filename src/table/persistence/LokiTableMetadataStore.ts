import { stat } from "fs";
import Loki from "lokijs";
import { newEtag } from "../../common/utils/utils";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { Entity, Table } from "../persistence/ITableMetadataStore";
import { SUPPORTED_QUERY_OPERATOR } from "../utils/constants";
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

  public async createTable(context: Context, table: Table): Promise<void> {
    // Check for table entry in the table registry collection
    const coll = this.db.getCollection(this.TABLE_COLLECTION);
    const doc = coll.findOne({
      account: table.account,
      table: table.table
    });

    // If the metadata exists, we will throw getTableAlreadyExists error
    if (doc) {
      throw StorageErrorFactory.getTableAlreadyExists(context);
    }
    coll.insert(table);

    // now we create the collection to represent the table using a unique string
    const tableCollectionName = this.getTableCollectionName(
      table.account,
      table.table
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

  public async insertTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: Entity
  ): Promise<void> {
    const tableColl = this.db.getCollection(
      this.getTableCollectionName(account, tableName)
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
    account: string
  ): Promise<Models.TableResponseProperties[]> {
    const coll = this.db.getCollection(this.TABLE_COLLECTION);
    const docList = coll.find({ account: account });

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
    account: string
  ): Promise<void> {
    const uniqueTableName = this.getTableCollectionName(account, name);
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
      account: account,
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
    account: string,
    tableName: string,
    queryOptions: Models.QueryOptions
  ): Promise<{ [propertyName: string]: any }[]> {
    const tableColl = this.db.getCollection(
      this.getTableCollectionName(account, tableName)
    );

    // Split parameters for filter
    const filters = queryOptions.filter!.split("and");
    const filterJson = {};
    for (let condition of filters) {
      condition = condition.trim();
      const length = condition.length;

      // Remove wrapping parentheses
      if (condition[0] === "(" && condition[length - 1] === ")") {
        condition = condition.substr(1, length - 2);
      }

      const comps = condition.split(" ");
      if (comps.length !== 3) {
        throw StorageErrorFactory.getQueryConditionInvalid(context);
      }

      let operator = comps[1];
      const firstParam = "properties." + comps[0];
      let secondParam = comps[2];

      if (SUPPORTED_QUERY_OPERATOR.indexOf(operator) >= 0) {
        const rightExpressionJSON = {};

        // Fix inconsistency with azure table query operator
        //    and lokijs query operator
        if (operator === "ge") {
          operator = "gte";
        }

        if (operator === "le") {
          operator = "lte";
        }

        operator = "$" + operator;
        secondParam = this.convertQueryParameters(secondParam, context);

        (rightExpressionJSON as any)[operator] = secondParam;
        (filterJson as any)[firstParam] = rightExpressionJSON;
      } else {
        throw StorageErrorFactory.getQueryConditionInvalid(context);
      }
    }

    // Query Result
    const result = tableColl.find(filterJson);
    if (result.length === 0) {
      return result;
    }

    let selectedResult = result;

    // Only return selected fields
    if (queryOptions.select !== undefined) {
      const selectedFieldsResult = [];
      const selectedFields = queryOptions.select.split(",");

      // Iterate all entities and get selected fields
      for (const entity of result) {
        // Check if the selected result has exceeded the top limits
        const entitySelectedFieldResult = {};
        (entitySelectedFieldResult as any).PartitionKey = entity.PartitionKey;
        (entitySelectedFieldResult as any).RowKey = entity.RowKey;
        (entitySelectedFieldResult as any).odataMetadata = entity.odataMetadata;
        (entitySelectedFieldResult as any).odataType = entity.odataType;
        (entitySelectedFieldResult as any).odataId = entity.odataId;
        (entitySelectedFieldResult as any).odataEditLink = entity.odataEditLink;
        (entitySelectedFieldResult as any).eTag = entity.eTag;
        (entitySelectedFieldResult as any).Timestamp = entity.lastModifiedTime;

        for (let field of selectedFields) {
          field = field.trim();
          const keys = field.split(".");
          let val = entity.properties;
          for (const key of keys) {
            val = val[key];
          }
          (entitySelectedFieldResult as any)[field] = val;
          (entitySelectedFieldResult as any)[
            field + "@odata.type"
          ] = this.getODataType(val);
        }

        // Add to result
        selectedFieldsResult.push(entitySelectedFieldResult);
      }

      selectedResult = selectedFieldsResult;
    }

    if (queryOptions.top !== undefined) {
      selectedResult = selectedResult.slice(0, queryOptions.top!);
    }

    return selectedResult;
  }

  public async queryTableEntitiesWithPartitionAndRowKey(
    context: Context,
    tableName: string,
    account: string,
    partitionKey: string,
    rowKey: string
  ): Promise<Entity> {
    const tableColl = this.db.getCollection(
      this.getTableCollectionName(account, tableName)
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

  public async updateTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: Entity,
    etag: string
  ): Promise<void> {
    const tableColl = this.db.getCollection(
      this.getTableCollectionName(account, tableName)
    );

    // Throw error, if table not exists
    if (!tableColl) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    // Get Current Doc
    const currentDoc = tableColl.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    }) as Entity;

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
    entity: Entity,
    etag: string
  ): Promise<string> {
    const tableColl = this.db.getCollection(
      this.getTableCollectionName(account, tableName)
    );

    // Throw error, if table not exists
    if (!tableColl) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    // Get Current Doc
    const currentDoc = tableColl.findOne({
      PartitionKey: entity.PartitionKey,
      RowKey: entity.RowKey
    }) as Entity;

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
    account: string,
    partitionKey: string,
    rowKey: string,
    etag: string
  ): Promise<void> {
    const tableColl = this.db.getCollection(
      this.getTableCollectionName(account, tableName)
    );
    if (!tableColl) {
      throw StorageErrorFactory.getTableNotExist(context);
    }

    if (partitionKey !== undefined && rowKey !== undefined) {
      const doc = tableColl.findOne({
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

  private getTableCollectionName(account: string, table: string): string {
    return `${account}$${table}`;
  }

  private convertQueryParameters(param: string, context: Context): any {
    const length = param.length;
    if (param[0] === "'" && param[length - 1] === "'") {
      // Param is of type string
      // Convert middle '' to '
      const idx = param.indexOf("''");
      if (idx > 0) {
        param = param.substr(0, idx) + param.substr(idx + 1, length);
      }
      return param.substr(1, param.length - 2);
    }

    if (param === "true" || param === "false") {
      // Param is of type boolean
      return param === "true";
    }

    const floatVal = parseFloat(param);
    const intVal = parseInt(param, 10);

    if (!isNaN(floatVal)) {
      if (intVal === floatVal) {
        return intVal;
      } else {
        return floatVal;
      }
    } else {
      throw StorageErrorFactory.getQueryConditionInvalid(context);
    }
  }

  private getODataType(val: any) {
    switch (typeof val) {
      case "string": {
        return "Edm.String";
      }
      case "number": {
        if (Number.isInteger(val)) {
          return "Edm.Int32";
        } else {
          return "Edm.Float";
        }
      }
      case "boolean": {
        return "Edm.Boolean";
      }
    }

    if (val instanceof Date) {
      return "Edm.DateTime";
    }
  }
}
