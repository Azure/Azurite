'use strict';

const AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes'),
    AzuriteBlobRequest = require('./../model/AzuriteBlobRequest'),
    AzuriteContainerRequest = require('./../model/AzuriteContainerRequest');

/*
 * Checks whether the item (container, blob) that is to be created already exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ConflictingItem {
    constructor() {
    }

    /**
     * @param {AzuriteRequest} options.request 
     * @param {object} options.collection
     * @memberof ConflictingItem
     */
    validate(options) {
        let isContainer = false,
            name = "";
        if (options.request instanceof AzuriteContainerRequest) {
            isContainer = true;
            name = request.containerName;
        } else {
            name = request.blobName;
        }

        if (options.collection.chain().find({ name: { '$eq': name } }).data().length === 1) {
            if (isContainer) {
                throw new AError(ErrorCodes.ContainerAlreadyExists);
            } else {
                throw new AError(ErrorCodes.BlobAlreadyExists);
            }
        }
    }
}

module.exports = new ConflictingItem();