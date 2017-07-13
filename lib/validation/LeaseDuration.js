'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class LeaseDuration {
    constructor() {
    }

    /**
     * Checks whether lease duration and lease break period conforms to specification
     * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container:
     * leaseDuration: -1;[15-60]
     * leaseBreakPeriod: [0-60] 
     * 
     * @param {number} options.leaseDuration
     * @param {number} options.leaseBreakPeriod
     * @memberof LeaseDuration
     */
    validate(options) {
        if (!(options.leaseDuration === -1 || options.leaseDuration >= 15 && options.leaseDuration <= 60)) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }

        if (!(options.leaseBreakPeriod >= 0 && options.leaseBreakPeriod <= 60)) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }
    }
}

module.exports = new LeaseDuration();