'use strict';

const AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes'),
    CopyStat = require('./../Constants').CopyStatus;

/**
 * Checks whether the a pending copy operation already exists at the destination.
 * 
 * @class CopyStatus
 */
class CopyStatus {
    constructor() {
    }

    validate({ blobProxy = undefined }) {
        if (blobProxy !== undefined && blobProxy.original.copyStatus === CopyStat.PENDING) {
            throw new AError(ErrorCodes.PendingCopyOperation);
        }        
    }
}

module.exports = new CopyStatus();