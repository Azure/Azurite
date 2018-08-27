'use strict';

import { ODataMode } from './../../core/Constants';
import InternalAzuriteError from './../../core/InternalAzuriteError';

class BaseProxy {
    _: any;
    constructor(entity) {
        this._ = entity;
    }

    /**
     * Returns the odata representation of the any (Table, Entity) entity.
     * 
     * @param {any} odata is (nometadata|minimalmetadata|fullmetadata)
     * @returns 
     * @memberof TableProxy
     */
    odata(mode) {
        switch (mode) {
            case ODataMode.NONE:
                return {
                    TableName: this._.name
                }
                break;
            case ODataMode.MINIMAL:
                return {
                    "odata.metadata": this._.odata.metadata,
                    TableName: this._.name
                }
                break;
            case ODataMode.FULL:
                return {
                    "odata.metadata": this._.odata.metadata,
                    "odata.type": this._.odata.type,
                    "odata.id": this._.odata.id,
                    "odata.editLink": this._.odata.editLink,
                    TableName: this._.name
                }
                break;
            default:
                throw new InternalAzuriteError(`TableProxy: Unsupported OData type "${mode}".`);
        }
    }
}

export default BaseProxy;