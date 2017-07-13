'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class LeaseActions {
    constructor() {
    }

    /**
     * Checks whether intended lease operation is semantically valid as specified
     * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
     * 
     * @param {any} options.container 
     * @param {string} options.leaseAction 
     * @param {string} options.leaseId 
     * @param {string} options.proposedLeaseId 
     * @memberof LeaseActions
     */
    validate(options) {
        const leaseAction = options.leaseAction;
        if (!['acquire', 'renew', 'change', 'release', 'break'].includes(leaseAction)) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }

        switch (container.leaseState) {
            case 'available':
                if (leaseAction !== 'acquire') {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                }
                break;
            case 'leased':
                
                break;
        }


        // ACQUIRE
        if (container.leaseId && (container.leaseExpiredAt >= Date.now() || container.leaseExpiredAt === -1)) {
            container.leaseId = proposedLeaseId || uuidv4();
            container.leaseExpiredAt = (leaseDuration === -1) ? -1 : Date.now() + leaseDuration * 1000;
        }
        // No active lease was ever specified ( no need to check whether x-ms-lease-id === leaseId)
        else {
            container.leaseId = proposedLeaseId || uuidv4();
            container.leaseExpiredAt = (leaseDuration === -1) ? -1 : Date.now() + leaseDuration * 1000;
        }


    }
}

module.exports = new LeaseActions();