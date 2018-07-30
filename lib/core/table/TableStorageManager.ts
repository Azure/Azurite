const Loki  from "lokijs"),
  import BbPromise from "bluebird";
  fs  from "fs-extra"),
  fsn = BbPromise.promisifyAll(from "fs")),
  AzuriteTableResponse  from "./../../model/table/AzuriteTableResponse"),
  TableProxy  from "./../../model/table/TableProxy"),
  EntityProxy  from "./../../model/table/EntityProxy"),
  EntityGenerator  from "./../../model/table/EntityGenerator"),
  Tables  from "./../Constants").TableStorageTables,
  env  from "./../../core/env");

class TableStorageManager {
  public init() {
    this.db = BbPromise.promisifyAll(
      new Loki(env.azuriteDBPathTable, {
        autosave: true,
        autosaveInterval: 5000
      })
    );
    return fsn
      .statAsync(env.azuriteDBPathTable)
      .then(stat => {
        return this.db.loadDatabaseAsync({});
      })
      .then(data => {
        if (!this.db.getCollection(Tables.Tables)) {
          this.db.addCollection(Tables.Tables);
        }
        return this.db.saveDatabaseAsync();
      })
      .catch(e => {
        if (e.code === "ENOENT") {
          // No DB has been persisted / initialized yet.
          this.db.addCollection(Tables.Tables);
          return this.db.saveDatabaseAsync();
        }
        // This should never happen!
        console.error(
          `Failed to initialize database at "${env.azuriteDBPathTable}"`
        );
        throw e;
      });
  }

  public createTable(request) {
    this.db.addCollection(request.tableName);
    const coll = this.db.getCollection(Tables.Tables);
    const tableEntity = EntityGenerator.generateTable(request.tableName);
    const proxy = new TableProxy(coll.insert(tableEntity));
    return BbPromise.resolve(new AzuriteTableResponse({ proxy }));
  }

  public insertEntity(request) {
    const proxy = this._createOrUpdateEntity(
      request.partitionKey,
      request.rowKey,
      request.tableName,
      request.payload
    );
    return BbPromise.resolve(new AzuriteTableResponse({ proxy }));
  }

  public deleteTable(request) {
    const coll = this.db.getCollection(Tables.Tables);
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
    const coll = this.db.getCollection(Tables.Tables);
    const payload = [];
    if (request.tableName !== undefined) {
      const result = coll
        .chain()
        .find({ name: request.tableName })
        .limit(request.top)
        .data();
      // there must be a table since we are validating its existence in validation pipeline
      payload.push(new TableProxy(result[0]));
      return BbPromise.resolve(new AzuriteTableResponse({ payload }));
    }

    let result;
    if (request.filter !== undefined) {
      result = coll
        .chain()
        .where(item => {
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
    const findExpr = {};
    if (request.partitionKey) {
      findExpr.partitionKey = request.partitionKey;
    }
    if (request.rowKey) {
      findExpr.rowKey = request.rowKey;
    }

    const chain = coll.chain().find(findExpr);
    if (request.filter) {
      chain.where(item => {
        return eval(request.filter);
      });
    }
    const result = chain.limit(request.top).data();
    const payload = [];
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
    const coll = this.db.getCollection(Tables.Tables);
    const result = coll
      .chain()
      .find({ name })
      .data();
    return result.length === 0 ? undefined : new TableProxy(result[0]);
  }

  public _deleteEntity(tableName, partitionKey, rowKey) {
    const coll = this.db.getCollection(tableName),
      result = coll
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
    const coll = this.db.getCollection(tableName),
      entity = EntityGenerator.generateEntity(rawEntity, tableName),
      res = coll.findOne({ partitionKey, rowKey });

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
    const coll = this.db.getCollection(tableName),
      entity = EntityGenerator.generateEntity(rawEntity, tableName),
      res = coll.findOne({ partitionKey, rowKey });

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
