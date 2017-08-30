'use strict';

const AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes'),
    Usage = require('./../Constants').Usage,
    LeaseStatus = require('./../Constants').LeaseStatus,
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

        switch (containerProxy.original.leaseState) {
            case LeaseStatus.AVAILABLE:
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
            case LeaseStatus.LEASED:
                if (usage === Usage.Delete && !leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === Usage.Delete && leaseId !== containerProxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                if (usage === Usage.Other && leaseId !== containerProxy.original.leaseId && leaseId !== undefined) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                break;
            case LeaseStatus.BREAKING:
                if (usage === Usage.Delete && leaseId !== containerProxy.original.leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithContainerOperation);
                }
                if (usage === Usage.Delete && !leaseId) {
                    throw new AError(ErrorCodes.LeaseIdMissing);
                }
                if (usage === Usage.Other && leaseId !== containerProxy.original.leaseId && leaseId !== undefined) {
                    throw new AError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
                }
                break;
            case LeaseStatus.BROKEN:
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
            case LeaseStatus.EXPIRED:
                if (leaseId) {
                    throw new AError(ErrorCodes.LeaseNotPresentWithContainerOperation);
                }
                break;
        }
    }
}

module.exports = new ContainerLeaseUsage();