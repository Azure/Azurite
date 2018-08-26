/** @format */

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';

class ConflictingEntity {
  constructor() {}

  validate({ entity = undefined }) {
    if (entity !== undefined) {
      throw new AError(ErrorCodes.EntityAlreadyExists);
    }
  }
}

export default new ConflictingEntity;