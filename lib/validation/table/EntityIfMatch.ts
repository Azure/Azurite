'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import { ErrorCodes } from '../../core/AzuriteError';

class EntityIfMatch {
    constructor() {
    }

    validate({ request = undefined, entity = undefined }) {
        if (request.httpProps[N.IF_MATCH] === undefined) {
            throw ErrorCodes.MissingRequiredHeader;
        }
        if (request.httpProps[N.IF_MATCH] === '*') {
            return;
        }
        if (request.httpProps[N.IF_MATCH] !== entity._.etag) {
            throw ErrorCodes.UpdateConditionNotSatisfied;
        }
    }
}

export default new EntityIfMatch;