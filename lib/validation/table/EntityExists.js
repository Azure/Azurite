/** @format */

"use strict";

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';

class EntityExists {
  constructor() {}

  validate({ entity = undefined }) {
    if (entity === undefined) {
      throw new AError(ErrorCodes.ResourceNotFound);
    }
  }
}

export default new EntityExists();
