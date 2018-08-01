/** @format */

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';
import { StorageEntityType as EntityType } from './../../core/Constants';

class SupportedBlobType {
  constructor() {}

  validate({ request = undefined }) {
    if (
      request.entityType !== EntityType.AppendBlob &&
      request.entityType !== EntityType.BlockBlob &&
      request.entityType !== EntityType.PageBlob
    ) {
      throw new AError(ErrorCodes.UnsupportedBlobType);
    }
  }
}

export default new SupportedBlobType();