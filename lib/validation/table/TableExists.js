'use strict';

const AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes');

class TableExists {
    constructor() {
    }

    validate({ table = undefined }) {
        if (table === undefined) {
            throw new AError(ErrorCodes.TableNotFound);
        }
    }
}

module.exports = new TableExists;