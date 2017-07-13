'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class LeaseActions {
    constructor() {
    }

    validate(options) {
        // ACQUIRE
        if (container.leaseId && (container.leaseValidUntil >= Date.now() || container.leaseValidUntil === -1)) {
            container.leaseId = proposedLeaseId || uuidv4();
            container.leaseValidUntil = (leaseDuration === -1) ? -1 : Date.now() + leaseDuration * 1000;
        }
        // No active lease was ever specified ( no need to check whether x-ms-lease-id === leaseId)
        else {
            container.leaseId = proposedLeaseId || uuidv4();
            container.leaseValidUntil = (leaseDuration === -1) ? -1 : Date.now() + leaseDuration * 1000;
        }


    }
}

module.exports = new LeaseActions();