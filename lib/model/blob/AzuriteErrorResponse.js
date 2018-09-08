/** @format */

"use strict";

import AzuriteResponse from "./AzuriteResponse";
import N from "./../../core/HttpHeaderNames";

class AzuriteErrorResponse extends AzuriteResponse {
  constructor({ proxy = undefined, error = undefined, cors = undefined } = {}) {
    super({ proxy, payload: error.message, cors });

    this.httpProps[N.ERROR_CODE] = error.errorCode;
    this.httpProps[N.CONTENT_TYPE] = error.messageContentType;
    this.status = error.statusCode;
  }
}

export default AzuriteErrorResponse;
