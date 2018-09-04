/** @format */

"use strict";

import storageManager from './../../core/blob/StorageManager';
import N from './../../core/HttpHeaderNames';

class AbortCopyBlob {
  constructor() {}

  process(azuriteRequest, res) {
    storageManager.copyBlob(azuriteRequest).then((response) => {
      res.status(204).send();
    });
  }
}

export default new AbortCopyBlob();
