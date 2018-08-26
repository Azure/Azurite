/** @format */

import AError from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import ErrorCodes from './../../core/ErrorCodes';

class EntityIfMatch {
  constructor() {}

  validate({ request = undefined, entity = undefined }) {
    if (request.httpProps[N.IF_MATCH] === undefined) {
      throw new AError(ErrorCodes.MissingRequiredHeader);
    }
    if (request.httpProps[N.IF_MATCH] === "*") {
      return;
    }
    if (request.httpProps[N.IF_MATCH] !== entity._.etag) {
      throw new AError(ErrorCodes.UpdateConditionNotSatisfied);
    }
  }
}

export default new EntityIfMatch;