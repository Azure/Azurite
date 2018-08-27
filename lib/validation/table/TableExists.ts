'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

class TableExists {
    constructor() {
    }

    validate({ request = undefined, table = undefined }) {
        if (request.tableName !== undefined && table === undefined) {
            throw ErrorCodes.TableNotFound;
        }
    }
}

export default new TableExists;