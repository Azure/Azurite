/** @format */

"use strict";

const etag = require("./../../core/utils").computeEtag;

const storageAccount = process.env.AZURE_STORAGE_ACCOUNT || 'devstoreaccount1'

const _baseUrl = `http://127.0.0.1:10002/${storageAccount}/`;

/**
 * Generates a Table Storage 'Table' entity and a Table Storage 'Entity' entity.
 *
 * @class TableGenerator
 */
class EntityGenerator {
  constructor() {}

  /**
   * Generates a persistable table storage 'Table' entity representation.
   *
   * @param {any} name of the table
   * @returns
   * @memberof TableGenerator
   */
  generateTable(name) {
    const entity = {};
    entity.name = name;
    entity.odata = {};
    entity.odata.metadata = `${_baseUrl}$metadata#Tables/@Element`;
    entity.odata.type = `${storageAccount}.Tables`;
    entity.odata.id = `${_baseUrl}Tables('${name}')`;
    entity.odata.editLink = `Tables('${name}')`;
    return entity;
  }

  generateEntity(
    rawEntity,
    tableName,
    partitionKey = undefined,
    rowKey = undefined
  ) {
    // Enriching raw entity from payload with odata attributes
    const entity = { attribs: {} };
    entity.partitionKey = partitionKey || rawEntity.PartitionKey;
    entity.rowKey = rowKey || rawEntity.RowKey;
    entity.attribs.Timestamp = new Date().toISOString();
    entity.attribs["Timestamp@odata.type"] = "Edm.DateTime";
    for (const key of Object.keys(rawEntity)) {
      if (key === "PartitionKey" || key === "RowKey" || key === "Timestamp") {
        continue;
      }
      entity.attribs[key] = rawEntity[key];
    }

    entity.odata = {};
    entity.odata.metadata = `${_baseUrl}${tableName}$metadata#${tableName}/@Element`;
    entity.odata.type = `${storageAccount}.${tableName}`;
    entity.odata.id = `${_baseUrl}${tableName}(PartitionKey='${
      rawEntity.PartitionKey
    }',RowKey='${rawEntity.RowKey}')`;
    entity.odata.editLink = `${tableName}(PartitionKey='${
      rawEntity.PartitionKey
    }',RowKey='${rawEntity.RowKey}')`;
    entity.odata.etag = etag(JSON.stringify(rawEntity));
    return entity;
  }
}

module.exports = new EntityGenerator();
