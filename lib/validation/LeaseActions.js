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
        const leaseAction = options.leaseAction,
            leaseId = options.leaseId || options.proposedLeaseId,
            container = options.container;

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
                if (leaseAction === 'acquire' && leaseId !== container.leaseId) {
                    throw new AError(ErrorCodes.LeaseAlreadyPresent);
                }
                if (['acquire', 'renew', 'release'].includes(leaseAction) &&
                    leaseId !== container.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case 'expired':
                if (leaseAction === 'change') {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                } else if ((leaseAction === 'renew' || leaseAction === 'release') &&
                    leaseId !== container.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case 'breaking':
                if (leaseId === container.leaseId) {
                    if (leaseAction === 'acquire') {
                        throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeAcquired);
                    }
                    if (leaseAction === 'change') {
                        throw new AError(ErrorCodes.LeaseIsBreakingAndCannotBeChanged);
                    }
                }
                if (leaseAction === 'acquire' ||
                    leaseAction === 'change' ||
                    leaseAction === 'renew') {
                    throw new AError(ErrorCodes.LeaseAlreadyPresent);
                }
                break;
            case 'broken':
                if (leaseAction === 'renew') {
                    throw new AError(ErrorCodes.LeaseIsBrokenAndCannotBeRenewed);
                }
                if (leaseAction === 'change') {
                    throw new AError(ErrorCodes.LeaseNotPresentWithLeaseOperation);
                }
                if (leaseAction === 'release' && leaseId !== container.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
        }
    }
}

module.exports = new LeaseActions();