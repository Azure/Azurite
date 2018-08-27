/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

/*
 * Checks whether the container exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ContainerExists {
  constructor() {}

    validate({ containerProxy = undefined }) {
        if (containerProxy === undefined) {
            throw ErrorCodes.ContainerNotFound;
        }
    }
  }
}

export default new ContainerExists;