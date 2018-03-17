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

    generateEntity(rawEntity, tableName) {
        // Enriching raw entity from payload with odata attributes
        const entity = {};

        entity.partitionKey = rawEntity.PartitionKey;
        entity.rowKey = rawEntity.RowKey;
        entity.attribs = rawEntity;
        for (const key of Object.keys(rawEntity)) {
            if (key === 'PartitionKey' || key === 'RowKey') {
                continue;
            }
            entity.attribs[key] = rawEntity[key];
        }

        entity.odata = {};
        entity.odata.metadata = `${_baseUrl}${tableName}$metadata#${tableName}/@Element`;
        entity.odata.type = `devstoreaccount1.${tableName}`;
        entity.odata.id = `${_baseUrl}${tableName}(PartitionKey='${rawEntity.PartitionKey}',RowKey='${rawEntity.RowKey}')`;
        entity.odata.editLink = `${tableName}(PartitionKey='${rawEntity.PartitionKey}',RowKey='${rawEntity.RowKey}')`;
        entity.odata.etag = etag(JSON.stringify(rawEntity));
        return entity;
    }
}

module.exports = new EntityGenerator();