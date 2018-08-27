/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

/*
 * Checks whether the blob has been committed yet as part of PUT BlockList.
 * Although a BlockBlob is created when the first block has been created it is not visible for operations
 * such as GET Blob.
 */
class BlobCommitted {
  constructor() {}

    validate({ blobProxy = undefined }) {
        if (blobProxy === undefined) {
            throw ErrorCodes.BlobNotFound;
        }

        if (!blobProxy.original.committed) {
            throw ErrorCodes.BlobNotFound;
        }
    }
  }
}

export default new BlobCommitted();