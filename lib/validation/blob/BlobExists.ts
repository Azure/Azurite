/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

/*
 * Checks whether the blob exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class BlobExists {
  constructor() {}

    validate({ blobProxy = undefined }) {
        if (blobProxy === undefined) {
            throw ErrorCodes.BlobNotFound;
        }
    }
  }
}

export default new BlobExists;