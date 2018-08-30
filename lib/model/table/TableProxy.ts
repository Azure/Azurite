/** @format */

import BaseProxy from './BaseProxy';

class TableProxy extends BaseProxy {
    name: any;
    constructor(entity) {
        super(entity);
        this.name = entity.name;
    }
}

export default TableProxy;