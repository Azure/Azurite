'use strict';

import path from 'path';
import env from './../../core/env';
import { StorageEntityType as EntityType } from './../../core/Constants';
import AzuriteRequest from './AzuriteRequest';

class AzuriteContainerRequest extends AzuriteRequest {
    constructor({
        req = null,
        payload = undefined }) {

        super({
            req: req,
            entityType: EntityType.Container,
            payload: payload
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
}

export default AzuriteContainerRequest;