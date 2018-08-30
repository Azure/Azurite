/** @format */

import AzuriteTableResponse from './../../model/table/AzuriteTableResponse';
import tableStorageManager from './../../core/table/TableStorageManager';
import { ODataMode } from './../../core/Constants';
import N from './../../core/HttpHeaderNames';

class UpdateEntity {
  constructor() {}

  process(request, res) {
    tableStorageManager.updateEntity(request).then((response) => {
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

export default new UpdateEntity;