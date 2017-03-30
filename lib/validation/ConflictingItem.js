'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

/*
 * Checks whether the item (container, blob) that is to be created already exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ConflictingItem {
    constructor() {
    }

    validate(options) {
        const name = options.containerName || requestBlob.name;
        if (options.collection.chain().find({ name: { '$eq': name } }).data().length === 1) {
            if (options.containerName) {
                throw new AError(ErrorCodes.ContainerAlreadyExists);
            } else {
                throw new AError(ErrorCodes.BlobAlreadyExists);
            }
        }
    }
}

module.exports = new ConflictingItem();