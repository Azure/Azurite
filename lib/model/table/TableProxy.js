'use strict';

const BaseProxy = require('./BaseProxy');

class TableProxy extends BaseProxy {
    constructor(entity) {
        super(entity);
        this.name = entity.name;
    }
}

module.exports = TableProxy;