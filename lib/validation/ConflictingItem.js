'use strict';

const AError = require('./../Error');

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
                throw new AError('ContainerAlreadyExists', 409, 'The specified container already exists.');
            } else {
                throw new AError('BlobAlreadyExists', 409, 'The specified blob already exists.');
            }
        }
    }
}

module.exports = new ConflictingItem();