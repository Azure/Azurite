/** @format */

"use strict";

import AError from "./../../core/AzuriteError";
import ErrorCodes from "./../../core/ErrorCodes";
import { StorageEntityType } from "./../../core/Constants";

class SupportedBlobType {
  constructor() {}

  validate({ request = undefined }) {
    if (
      request.entityType !== StorageEntityType.AppendBlob &&
      request.entityType !== StorageEntityType.BlockBlob &&
      request.entityType !== StorageEntityType.PageBlob
    ) {
      throw new AError(ErrorCodes.UnsupportedBlobType);
    }
  }
}

export default new SupportedBlobType();
