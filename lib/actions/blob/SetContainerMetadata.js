/** @format */

"use strict";

const storageManager = require("./../../core/blob/StorageManager");

class SetContainerMetadata {
  constructor() {}

  process(request, res) {
    storageManager.setContainerMetadata(request).then((response) => {
      res.set(response.httpProps);
      res.status(200).send();
    });
  }
}

module.exports = new SetContainerMetadata();
