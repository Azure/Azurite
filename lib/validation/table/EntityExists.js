'use strict';

const AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes');

class EntityExists {
    constructor() {
    }

    validate({ entity = undefined }) {
        if (entity === undefined) {
            throw new AError(ErrorCodes.ResourceNotFound);
        }
    }
}

module.exports = new EntityExists;