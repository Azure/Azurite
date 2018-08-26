/** @format */

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';

/*
 * Checks whether the blob exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class BlobExists {
  constructor() {}

  validate({ blobProxy = undefined }) {
    if (blobProxy === undefined) {
      throw new AError(ErrorCodes.BlobNotFound);
    }
  }
}

export default new BlobExists;