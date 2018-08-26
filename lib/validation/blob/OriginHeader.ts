/** @format */

import AError from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import ErrorCodes from './../../core/ErrorCodes';

/**
 * Validates whether the 'Origin' request header is set.
 *
 * @class
 */
class OriginHeader {
  constructor() {}

  validate({ request = undefined }) {
    if (!request.httpProps[N.ORIGIN]) {
      throw new AError(ErrorCodes.MissingRequiredHeader);
    }
  }
}

export default new OriginHeader;