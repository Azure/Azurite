'use strict';

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';

/*
 * Checks whether the container exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ContainerExists {
    constructor() {
    }

    validate({ containerProxy = undefined }) {
        if (containerProxy === undefined) {
            throw new AError(ErrorCodes.ContainerNotFound);
        }
    }
}

export default new ContainerExists;