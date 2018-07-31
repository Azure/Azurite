import { FSStorage } from "@lokidb/fs-storage";
import { Loki } from "@lokidb/loki";
import * as BbPromise from "bluebird";
import { asyncIt } from "../../lib/asyncIt";
import AzuriteTableResponse from "../../model/table/AzuriteTableResponse";
import EntityGenerator from "../../model/table/EntityGenerator";
import EntityProxy from "../../model/table/EntityProxy";
import TableProxy from "../../model/table/TableProxy";
import { TableStorageTables } from "../Constants";
import Environment from "../env";

class TableStorageManager {
  public db: Loki;
  constructor() {
    this.db = new Loki(Environment.azuriteDBPathTable, {
      autosave: true,
      autosaveinterval: 5000
    });
  }
  public init() {
    const adapter = { adapter: new FSStorage() };
    return (
      this.db
        .initializePersistence(adapter)
        // .then(() => {
        //   return this.db.loadDatabase();
        // })
        .then(() => {
          this.db.addCollection(TableStorageTables.Tables);
          return this.db.saveDatabase();
        })
        .catch(e => {
          if (e.code === "ENOENT") {
            // No DB has been persisted / initialized yet.
            this.db.addCollection(TableStorageTables.Tables);
            return this.db.saveDatabase();
          }
          // This should never happen!
          // tslint:disable-next-line:no-console
          console.error(
            `Failed to initialize database at "${Environment.azuriteDBPathTable}"`
          );
          throw e;
        })
    );
  }

  public createTable(request) {
    this.db.addCollection(request.tableName);
    const coll = this.db.getCollection(TableStorageTables.Tables);
    const tableEntity = EntityGenerator.generateTable(request.tableName);
    const proxy = new TableProxy(coll.insert(tableEntity));
    return BbPromise.resolve(new AzuriteTableResponse(proxy));
  }

  public insertEntity(request) {
    const proxy = this._createOrUpdateEntity(
      request.partitionKey,
      request.rowKey,
      request.tableName,
      request.payload
    );
    return BbPromise.resolve(new AzuriteTableResponse(proxy));
  }

  public deleteTable(request) {
    const coll = this.db.getCollection(TableStorageTables.Tables);
    coll
      .chain()
      .find({ name: { $eq: request.tableName } })
      .remove();
    this.db.removeCollection(request.tableName);
    return BbPromise.resolve(new AzuriteTableResponse({}));
  }

  public deleteEntity(request) {
    this._deleteEntity(request.tableName, request.partitionKey, request.rowKey);
    return BbPromise.resolve(new AzuriteTableResponse({}));
  }

  public queryTable(request) {
    const coll = this.db.getCollection(TableStorageTables.Tables);
    const payload: TableProxy[] = [];
    let result;
    if (request.tableName !== undefined) {
      result = coll
        .chain()
        .find({ name: request.tableName })
        .limit(request.top)
        .data();
      // there must be a table since we are validating its existence in validation pipeline
      payload.push(new TableProxy(result[0]));
      return BbPromise.resolve(new AzuriteTableResponse({ payload }));
    }

    if (request.filter !== undefined) {
      result = coll
        .chain()
        .where(item => {
          // tslint:disable-next-line:no-eval
          return eval(request.filter);
        })
        .limit(request.top)
        .data();
    } else {
      // Returning all tables
      result = coll
        .chain()
        .find({})
        .limit(request.top)
        .data();
    }
    for (const table of result) {
      payload.push(new TableProxy(table));
    }
    return BbPromise.resolve(new AzuriteTableResponse({ payload }));
  }

  public queryEntities(request) {
    const coll = this.db.getCollection(request.tableName);
    const findExpr = {
      partitionKey: undefined,
      rowKey: undefined
    };

    if (request.partitionKey) {
      findExpr.partitionKey = request.partitionKey;
    }
    if (request.rowKey) {
      findExpr.rowKey = request.rowKey;
    }

    const chain = coll.chain().find(findExpr);
    if (request.filter) {
      chain.where(item => {
        // tslint:disable-next-line:no-eval
        return eval(request.filter);
      });
    }
    const result = chain.limit(request.top).data();
    const payload: EntityProxy[] = [];
    for (const item of result) {
      payload.push(new EntityProxy(item));
    }

    return BbPromise.resolve(new AzuriteTableResponse({ payload }));
  }

  public updateEntity(request) {
    const proxy = this._createOrUpdateEntity(
      request.partitionKey,
      request.rowKey,
      request.tableName,
      request.payload
    );
    return BbPromise.resolve(new AzuriteTableResponse({ proxy }));
  }

  public insertOrReplaceEntity(request) {
    const proxy = this._createOrUpdateEntity(
      request.partitionKey,
      request.rowKey,
      request.tableName,
      request.payload
    );
    return BbPromise.resolve(new AzuriteTableResponse({ proxy }));
  }

  public mergeEntity(request) {
    const proxy = this._insertOrMergeEntity(
      request.partitionKey,
      request.rowKey,
      request.tableName,
      request.payload
    );
    return BbPromise.resolve(new AzuriteTableResponse({ proxy }));
  }

  public insertOrMergeEntity(request) {
    const proxy = this._insertOrMergeEntity(
      request.partitionKey,
      request.rowKey,
      request.tableName,
      request.payload
    );
    return BbPromise.resolve(new AzuriteTableResponse({ proxy }));
  }

  public _getTable(name) {
    const coll = this.db.getCollection(TableStorageTables.Tables);
    const result = coll
      .chain()
      .find({ name })
      .data();
    return result.length === 0 ? undefined : new TableProxy(result[0]);
  }

  public _deleteEntity(tableName, partitionKey, rowKey) {
    const coll = this.db.getCollection(tableName);
    coll
      .chain()
      .find({
        $and: [
          {
            partitionKey: { $eq: partitionKey }
          },
          {
            rowKey: { $eq: rowKey }
          }
        ]
      })
      .remove();
  }

  public _getEntity(tableName, partitionKey, rowKey) {
    const coll = this.db.getCollection(tableName);
    if (coll === null) {
      return undefined;
    }
    const result = coll
      .chain()
      .find({
        $and: [
          {
            partitionKey: { $eq: partitionKey }
          },
          {
            rowKey: { $eq: rowKey }
          }
        ]
      })
      .data();
    return result.length === 0 ? undefined : new EntityProxy(result[0]);
  }

  public _createOrUpdateEntity(partitionKey, rowKey, tableName, rawEntity) {
    const coll = this.db.getCollection(tableName);
    const entity = EntityGenerator.generateEntity(rawEntity, tableName);
    const res = coll.findOne({ partitionKey, rowKey });

    if (res !== null) {
      res.attribs = entity.attribs;
      res.odata = entity.odata;
      coll.update(res);
      return new EntityProxy(res);
    }
    const entityProxy = new EntityProxy(coll.insert(entity));
    return entityProxy;
  }

  public _insertOrMergeEntity(partitionKey, rowKey, tableName, rawEntity) {
    const coll = this.db.getCollection(tableName);
    const entity = EntityGenerator.generateEntity(rawEntity, tableName);
    const res = coll.findOne({ partitionKey, rowKey });

    if (res !== null) {
      // A property cannot be removed with a Merge Entity operation (in contrast to an update operation).
      for (const key of Object.keys(entity.attribs)) {
        if (entity.attribs[key]) {
          res.attribs[key] = entity.attribs[key];
        }
      }
      res.odata = entity.odata;
      coll.update(res);
      return new EntityProxy(res);
    }
    return this._createOrUpdateEntity(
      partitionKey,
      rowKey,
      tableName,
      rawEntity
    );
  }
}

export default new TableStorageManager();
