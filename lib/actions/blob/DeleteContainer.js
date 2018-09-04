/** @format */

"use strict";

import storageManager from './../../core/blob/StorageManager';

class DeleteContainer {
  constructor() {}

  process(azuriteRequest, res) {
    storageManager
      .deleteContainer(azuriteRequest)
      .then((response) => {
        res.set(response.httpProps);
        res.status(202).send();
        // Fixme: For some unknown reason the outer catch in middleware/actions.js is never hit.
        // Thus catching it here to make sure that a 500 is returned in an error case.
      })
      .catch((e) => {
        res.status(500).send(e.message);
        throw e;
      });
  }
}

export default new DeleteContainer();
