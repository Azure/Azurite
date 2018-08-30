/** @format */

"use strict";

const AError = require("./../../core/AzuriteError"),
  N = require("./../../core/HttpHeaderNames"),
  ErrorCodes = require("./../../core/ErrorCodes");

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

module.exports = new OriginHeader();
