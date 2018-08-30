'use strict';

const AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes');

/*
 * Checks whether the container exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ContainerExists {
    constructor() {
    }

    validate({ containerProxy = undefined }) {
        if (containerProxy === undefined) {
            throw new AError(ErrorCodes.ContainerNotFound);
        }
    }
}

module.exports = new ContainerExists;