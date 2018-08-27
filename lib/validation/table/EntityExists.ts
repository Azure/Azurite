'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

class EntityExists {
    constructor() {
    }

    validate({ entity = undefined }) {
        if (entity === undefined) {
            throw ErrorCodes.ResourceNotFound;
        }
    }
}

export default new EntityExists;