'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class ContainerLeaseUsage {
    constructor() {
    }

    /**
     * Checks whether intended lease usage operation is semantically valid as specified
     * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
     * 
     * @param {any} options.container 
     * @param {string} options.leaseId 
     * @param {string} options.usage either 'delete' or 'other' 
     * @memberof LeaseActions
     */
    validate(options) {
        const leaseId = options.leaseId,
            usage = options.usage,
            container = options.container;

        switch (container.leaseState) {
            case 'available':
                if (container.leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
            case 'leased':
                if (usage === 'delete' && leaseId !== container.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                if (usage === 'delete' && !leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === 'other' && leaseId !== container.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case 'breaking':
                if (usage === 'delete' && leaseId !== container.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                if (usage === 'delete' && !leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === 'other' && leaseId !== container.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case 'broken':
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
            case 'expired':
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
        }
    }
}

module.exports = new ContainerLeaseUsage();