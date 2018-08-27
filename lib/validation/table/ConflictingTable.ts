'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

class ConflictingTable {
    constructor() {
    }

    validate({ table = undefined }) {
        if (table !== undefined) {
            throw ErrorCodes.TableAlreadyExists;
        }
    }
}

export default new ConflictingTable;