/** @format */

"use strict";

const storageManager = require("./../../core/blob/StorageManager");

class SetBlobServiceProperties {
  constructor() {}

  process(request, res) {
    storageManager.setBlobServiceProperties(request).then((response) => {
      res.set(response.httpProps);
      res.status(202).send();
    });
  }
}

module.exports = new SetBlobServiceProperties();
