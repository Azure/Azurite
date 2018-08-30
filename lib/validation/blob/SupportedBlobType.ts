/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';
import { StorageEntityType as EntityType } from './../../core/Constants';

class SupportedBlobType {
  constructor() {}

    validate({ request = undefined }) {
        if (request.entityType !== EntityType.AppendBlob &&
            request.entityType !== EntityType.BlockBlob &&
            request.entityType !== EntityType.PageBlob) {
            throw ErrorCodes.UnsupportedBlobType;
        }
    }
  }
}

export default new SupportedBlobType();