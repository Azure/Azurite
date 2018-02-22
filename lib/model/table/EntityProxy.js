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
        const o = super.odata(mode);
        switch (mode) {
            case ODataMode.FULL:
                o.odata.etag = this._.odata.etag;
                break;
            default:
                throw new InternalAzuriteError(`TableProxy: Unsupported OData type "${mode}".`);
        }
        return o;
    }
}

module.exports = EntityProxy;