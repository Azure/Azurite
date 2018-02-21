'use strict';

class TableProxy {
    constructor(entity) {
        this._ = entity;
    }

    /**
     * Returns the odata representation of the table entity.
     * 
     * @param {any} odata is (nometadata|minimalmetadata|fullmetadata)
     * @returns 
     * @memberof TableProxy
     */
    odata(mode) {
        return this._;
    }
}

module.exports = TableProxy;