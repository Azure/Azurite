'use strict';

const AError = require('./../../AzuriteError'),
    CopyOperationsManager = require('./../../CopyOperationsManager'),
    ErrorCodes = require('./../../ErrorCodes');

/**
 *  Checks whether there is no pending copy operation. 
 * 
 * @class AbortCopy
 */
class AbortCopy {
    constructor() {
    }

    validate() {
        if (!CopyOperationsManager.isPending()) {
            throw new AError(ErrorCodes.NoPendingCopyOperation);
        }
    }
}

module.exports = new AbortCopy();