'use strict';

const AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes'),
    Usage = require('./../Constants').Usage,
    ContainerProxy = require('./../model/ContainerProxy');

/**
 * Checks whether intended lease usage operation is semantically valid as specified
 * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
 * 
 * @class ContainerLeaseUsage
 */
class ContainerLeaseUsage {
    constructor() {
    }

    /**
     * @param {any} options.request 
     * @param {string} options.collection 
     * @memberof LeaseActions
     */
    validate(options) {
        const leaseId = options.request.leaseId(),
            coll = options.collection,
            usage = options.request.usage,

        const containerProxy = new ContainerProxy(coll.chain().find({ 'name': { '$eq': request.containerName } }).data()[0]);
        containerProxy.updateLeaseState();

        switch (containerProxy.leaseState) {
            case 'available':
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
            case 'leased':
                if (usage === Usage.Delete && !leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === Usage.Delete && leaseId !== containerProxy.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                if (usage === Usage.Other && leaseId !== containerProxy.leaseId && leaseId !== undefined) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                break;
            case 'breaking':
                if (usage === Usage.Delete && leaseId !== containerProxy.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                if (usage === Usage.Delete && !leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === Usage.Other && leaseId !== containerProxy.leaseId && leaseId !== undefined) {
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