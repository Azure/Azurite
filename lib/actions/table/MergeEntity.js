/** @format */

"use strict";

import AzuriteTableResponse from './../../model/table/AzuriteTableResponse';
import tableStorageManager from './../../core/table/TableStorageManager';
import { ODataMode } from './../../core/Constants';
import N from './../../core/HttpHeaderNames';

class MergeEntity {
  constructor() {}

  process(request, res) {
    tableStorageManager.mergeEntity(request).then((response) => {
      response.addHttpProperty(N.ETAG, response.proxy.etag);
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

export default new MergeEntity();
