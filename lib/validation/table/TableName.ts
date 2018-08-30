/** @format */

"use strict";

'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

class TableName {
  constructor() {}

  validate({ table = undefined }) {
    if (table === undefined) {
      return;
    }

        if (/^tables$/i.test(table.name)) {
            throw ErrorCodes.ReservedTableName;
        }
        if (/[A-Za-z][A-Za-z0-9]{2,62}/i.test(table.name) === false) {
            throw ErrorCodes.InvalidInput;
        }
    }
  }
}

export default new TableName;