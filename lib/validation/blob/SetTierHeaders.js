'use strict';

const AError = require('./../../core/AzuriteError'),
  N = require('./../../core/HttpHeaderNames'),
  EntityType = require('./../../core/Constants').StorageEntityType,
  ErrorCodes = require('./../../core/ErrorCodes');

class SetTierHeaders {
  constructor() {
  }
  validate({ request = undefined }) {
    if(request.httpProps[N.BLOB_ACCESS_TIER] === undefined) {
      throw new AError(ErrorCodes.MissingRequiredHeader);
    }

  }
}

module.exports = new SetTierHeaders();
