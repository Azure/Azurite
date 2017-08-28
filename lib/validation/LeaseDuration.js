'use strict';

const AError = require('./../AzuriteError'),
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
     * @param {string} options.leaseAction
     * @memberof LeaseDuration
     */
    validate(options) {
        // x-ms-lease-duration is only required and processed for lease action 'acquire' 
        if (options.leaseAction === 'acquire') {
            if (!(options.leaseDuration === -1 || options.leaseDuration >= 15 && options.leaseDuration <= 60)) {
                throw new AError(ErrorCodes.InvalidHeaderValue);
            }
        }

        // x-ms-lease-break-period is optional
        if (options.leaseBreakPeriod) {
            if (!(options.leaseBreakPeriod >= 0 && options.leaseBreakPeriod <= 60)) {
                throw new AError(ErrorCodes.InvalidHeaderValue);
            }
        }

    }
}

module.exports = new LeaseDuration();