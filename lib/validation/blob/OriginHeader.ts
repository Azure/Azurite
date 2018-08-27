'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import { ErrorCodes } from '../../core/AzuriteError';

/**
 * Validates whether the 'Origin' request header is set. 
 * 
 * @class 
 */
class OriginHeader {
    constructor() {
    }

    validate({ request = undefined }) {
        if(!request.httpProps[N.ORIGIN]) {
            throw ErrorCodes.MissingRequiredHeader;
        }
    }
}

export default new OriginHeader;