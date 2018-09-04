/** @format */

"use strict";

import AError from "./../../core/AzuriteError";
import N from "./../../core/HttpHeaderNames";
import { StorageEntityType } from "./../../core/Constants";
import ErrorCodes from "./../../core/ErrorCodes";

class PutBlobHeaders {
  constructor() {}

  validate({ request = undefined }) {
    const length = request.httpProps[N.BLOB_CONTENT_LENGTH];
    if (request.entityType === StorageEntityType.PageBlob) {
      if (length && (length < 0 || length % 512 != 0)) {
        throw new AError(ErrorCodes.InvalidHeaderValue);
      }
    } else {
      if (length) {
        throw new AError(ErrorCodes.UnsupportedHeader);
      }
    }
  }
}

export default new PutBlobHeaders();
