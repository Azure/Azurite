/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import { ErrorCodes } from '../../core/AzuriteError';

/**
 * Checks whether the following conditional request headers specific to an AppendBlob are satisfied.
 * See https://docs.microsoft.com/rest/api/storageservices/append-block for details.
 *
 * - x-ms-blob-condition-maxsize
 * - x-ms-blob-condition-appendpos
 *
 * @class AppendBlobConditionalRequestHeaders
 */
class AppendBlobConditionalRequestHeaders {
  constructor() {}

  validate({ request = undefined, blobProxy = undefined }) {
    const maxSize = request.httpProps[N.BLOB_CONDITION_MAX_SIZE],
      appendPos = request.httpProps[N.BLOB_CONDITION_APPENDPOS];

        if (maxSize !== undefined && (blobProxy.original.size > maxSize || (blobProxy.original.size + request.body.length) > maxSize)) {
            throw ErrorCodes.MaxBlobSizeConditionNotMet;
        }
        if (appendPos !== undefined && blobProxy.original.size !== appendPos) {
            throw ErrorCodes.AppendPositionConditionNotMet;
        }
    }
  }
}

export default new AppendBlobConditionalRequestHeaders();
