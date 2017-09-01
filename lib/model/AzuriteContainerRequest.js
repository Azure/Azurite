'use strict';

const path = require('path'),
    env = require('./../env'),
    EntityType = require('./../Constants').StorageEntityType,
    AzuriteRequest = require('./AzuriteRequest');

class AzuriteContainerRequest extends AzuriteRequest {
    constructor({
        req = null }) {

        super({
            req: req,
            entityType: EntityType.Container
        });

        this.containerName = req.params.container;
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

    /**
     * A container request cannot refer to a blob name (which is what publicName is about).
     * 
     * @returns 
     * @memberof AzuriteContainerRequest
     */
    publicName() {
        return undefined;
    }
}

module.exports = AzuriteContainerRequest;