'use strict';

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';

class ConflictingTable {
    constructor() {
    }

    validate({ table = undefined }) {
        if (table !== undefined) {
            throw new AError(ErrorCodes.TableAlreadyExists);
        }
    }
}

export default new ConflictingTable;