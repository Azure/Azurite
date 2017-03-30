'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

/*
 * Checks whether the container exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ContainerExists {
    constructor() {
    }

    /** 
     * @param {Object} options - validation input
     * @param {Object} options.collection - Reference to in-memory database
     * @param {String} options.containerName - The name of the container involved (optional)
     */
    validate(options) {
        const name = options.containerName;
        const coll = options.collection;
        if (!coll || coll.chain().find({ name: { '$eq': name } }).data().length !== 1) {
            throw new AError(ErrorCodes.ContainerNotFound);
        }
    }
}

module.exports = new ContainerExists;