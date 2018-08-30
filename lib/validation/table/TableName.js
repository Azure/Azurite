

'use strict';

const AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes');

class TableName {
    constructor() {
    }

    validate({ table = undefined }) {
        if (table === undefined) {
            return;
        }

        if (/^tables$/i.test(table.name)) {
            throw new AError(ErrorCodes.ReservedTableName);
        }
        if (/[A-Za-z][A-Za-z0-9]{2,62}/i.test(table.name) === false) {
            throw new AError(ErrorCodes.InvalidInput);
        }
    }
}

module.exports = new TableName;