/** @format */

"use strict";

const AError = require("./../../core/AzuriteError"),
  N = require("./../../core/HttpHeaderNames"),
  ErrorCodes = require("./../../core/ErrorCodes");

class EntityIfMatch {
  constructor() {}

  validate({ request = undefined, entity = undefined }) {
    if (request.httpProps[N.IF_MATCH] === undefined) {
      throw new AError(ErrorCodes.MissingRequiredHeader);
    }
    if (request.httpProps[N.IF_MATCH] === "*") {
      return;
    }
    var etag = request.httpProps[N.IF_MATCH];
    if (etag.includes("datetime")) {
      // Clients use the entity's timestamp as etag when entities are queried
      // with no or minimal metadata. If that's the case match against the 
      // Timestamp attribute.
      var match = /W\/"datetime'(.*)'"/.exec(etag);
      if (match !== null) {
        var etagTimestamp = Date.parse(decodeURIComponent(match[1]));
        var entityTimestamp = Date.parse(entity._.attribs.Timestamp);
        if (etagTimestamp == entityTimestamp) {
          return;
        }

        throw new AError(ErrorCodes.UpdateConditionNotSatisfied);
      }
    }
    if (request.httpProps[N.IF_MATCH] !== entity._.etag) {
      throw new AError(ErrorCodes.UpdateConditionNotSatisfied);
    }
  }
}

module.exports = new EntityIfMatch();
