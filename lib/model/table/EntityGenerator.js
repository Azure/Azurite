'use strict';

const etag = require('./../../core/utils').computeEtag;

const _baseUrl = `http://127.0.0.1:10002/devstoreaccount1/`;

/**
 * Generates a Table Storage 'Table' entity and a Table Storage 'Entity' entity.
 * 
 * @class TableGenerator
 */
class EntityGenerator {
    constructor() {
    }

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
        entity.odata.type = `devstoreaccount1.Tables`;
        entity.odata.id = `${_baseUrl}Tables('${name}')`;
        entity.odata.editLink = `Tables('${name}')`;
        return entity;
    }

    generateEntity(entity, tableName) {
        // Enriching raw entity from payload with odata attributes
        entity.odata = {};
        entity.odata.metadata = `${_baseUrl}${tableName}$metadata#${tableName}/@Element`;
        entity.odata.type = `devstoreaccount1.${tableName}`;
        entity.odata.id = `${_baseUrl}${tableName}(PartitionKey='${entity.PartitionKey}',RowKey='${entity.RowKey}')`;
        entity.odata.editLink = `${tableName}(PartitionKey='${entity.PartitionKey}',RowKey='${entity.RowKey}')`;
        entity.odata.etag = etag(JSON.stringify(entity));
        return entity;
    }
}

module.exports = new EntityGenerator();