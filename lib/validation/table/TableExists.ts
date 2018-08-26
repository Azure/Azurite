/** @format */

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';

class TableExists {
  constructor() {}

  validate({ request = undefined, table = undefined }) {
    if (request.tableName !== undefined && table === undefined) {
      throw new AError(ErrorCodes.TableNotFound);
    }
  }
}

export default new TableExists;