'use strict';

const ODataMode = require('./../../core/Constants').ODataMode,
    BaseProxy = require('./BaseProxy'),
    InternalAzuriteError = require('./../../core/InternalAzuriteError');

class EntityProxy extends BaseProxy {
    constructor(entity) {
        super(entity);
        this.partitionKey = entity.PartitionKey;
        this.rowKey = entity.RowKey;
    }

    /**
     * Returns the odata representation of the 'Entity' entity.
     * 
     * @param {any} odata is (nometadata|minimalmetadata|fullmetadata)
     * @returns 
     * @memberof TableProxy
     */
    odata(mode) {
        const odata = super.odata(mode);
        if (mode === ODataMode.FULL) {
            odata.etag = this._.odata.etag;
        }
        return odata;
    }
}

module.exports = EntityProxy;