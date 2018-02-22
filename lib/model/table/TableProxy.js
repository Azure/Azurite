'use strict';

const ODataMode = require('./../../core/Constants').ODataMode,
    InternalAzuriteError = require('./../../core/InternalAzuriteError');

class TableProxy {
    constructor(entity) {
        this._ = entity;
        this.name = entity.TableName;
    }

    /**
     * Returns the odata representation of the table entity.
     * 
     * @param {any} odata is (nometadata|minimalmetadata|fullmetadata)
     * @returns 
     * @memberof TableProxy
     */
    odata(mode) {
        switch (mode) {
            case ODataMode.NONE:
                return {
                    TableName: this._.TableName
                }
                break;
            case ODataMode.MINIMAL:
                return {
                    "odata.metadata": this._.odata.metadata,
                    TableName: this._.TableName
                }
                break;
            case ODataMode.FULL:
                return {
                    "odata.metadata": this._.odata.metadata,
                    "odata.type": this._.odata.type,
                    "odata.id": this._.odata.id,
                    "odata.editLink": this._.odata.editLink,
                    TableName: this._.TableName
                }
                break;
            default:
                throw new InternalAzuriteError(`TableProxy: Unsupported OData type "${mode}".`);
        }
    }
}

module.exports = TableProxy;