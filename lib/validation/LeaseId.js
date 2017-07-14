'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes'),
    isUUID = require('validator/lib/isUUID');


class LeaseId {
    constructor() {
    }

    /**
     * Checks whether leaseId complies to RFC4122 (UUID) version 3-5.
     * 
     * @param {string} options.leaseId 
     * @param {string} options.proposedLeaseId 
     * @memberof LeaseId
     */
    validate(options) {
        if (options.leaseId && !isUUID(options.leaseId, 'all')) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }
        if (options.proposedLeaseId && !isUUID(options.proposedLeaseId, 'all')) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }
    }
}

module.exports = new LeaseId();