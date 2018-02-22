'use strict';

/**
 * Generates a Table Storage 'Table' Entity
 * 
 * @class TableGenerator
 */
class TableGenerator {
    constructor() {
    }

    /**
     * Generates a persistable table storage 'Table' entity representation.
     * 
     * @param {any} name of the table
     * @returns 
     * @memberof TableGenerator
     */
    generateStorageEntity(name) {
        const entity = {};
        entity.TableName = name;
        const baseUrl = `http://127.0.0.1:10002/devstoreaccount1/`;
        entity.odata = {};
        entity.odata.metadata = `${baseUrl}$metadata#Tables/@Element`;
        entity.odata.type = `devstoreaccount1.Tables`;
        entity.odata.id = `${baseUrl}Tables('${name}')`;
        entity.odata.editLink = `Tables('${name}')`;
        return entity;
    }
}

module.exports = new TableGenerator();