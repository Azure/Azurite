/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

class ConflictingEntity {
  constructor() {}

    validate({ entity = undefined }) {
        if (entity !== undefined) {
            throw ErrorCodes.EntityAlreadyExists;
        }
    }
  }
}

export default new ConflictingEntity;