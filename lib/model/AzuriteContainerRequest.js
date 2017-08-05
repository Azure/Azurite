'use strict';

const path = require('path'),
    env = require('./../env'),
    EntityType = require('./../Constants').StorageEntityType,
    AzuriteRequest = require('./AzuriteRequest');

class AzuriteContainerRequest extends AzuriteRequest {
    constructor({
        containerName = '',
        httpHeaders = {},
        rawHeaders = [],
        usage = null }) {

        super({ containerName: containerName, httpHeaders: httpHeaders, rawHeaders: rawHeaders, entityType: EntityType.Container, usage: usage });
    }

    /**
     * Returns the full path on disk where the container (directory) will be created 
     * (e.g. /home/user1/azurite-workspace/__blobstorage__/my-container)
     * 
     * @returns full path to container
     * @memberof AzuriteContainerRequest
     */
    fullPath() {
        return path.join(env.localStoragePath, this.containerName);
    }
}

module.exports = AzuriteContainerRequest;