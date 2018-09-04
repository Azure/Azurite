/** @format */

"use strict";

import AzuriteTableResponse from './../../model/table/AzuriteTableResponse';
import tableStorageManager from './../../core/table/TableStorageManager';
import N from './../../core/HttpHeaderNames';

class DeleteEntity {
  constructor() {}

  process(request, res) {
    tableStorageManager.deleteEntity(request).then((response) => {
      res.set(request.httpProps);
      res.status(204).send();
    });
  }
}

export default new DeleteEntity();
