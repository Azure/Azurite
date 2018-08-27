'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

/*
 * Checks whether the container that is to be created already exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ConflictingContainer {
    constructor() {
    }

    validate({ containerProxy = undefined }) {
        if (containerProxy !== undefined) {
            throw ErrorCodes.ContainerAlreadyExists;
        }
    }
}

export default new ConflictingContainer();