/** @format */

import storageManager from './../../core/blob/StorageManager';
import N from './../../core/HttpHeaderNames';

class SnapshotBlob {
  constructor() {}

  process(request, res) {
    storageManager.snapshotBlob(request).then((response) => {
      response.addHttpProperty(
        N.SNAPSHOT_DATE,
        response.proxy.original.snapshotDate
      );
      res.set(response.httpProps);
      res.status(201).send();
    });
  }
}

export default new SnapshotBlob();