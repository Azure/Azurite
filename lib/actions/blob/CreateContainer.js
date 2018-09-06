/** @format */

"use strict";

const storageManager = require("./../../core/blob/StorageManager");

class CreateContainer {
  constructor() {}

    process(azuriteRequest, res) {
        storageManager.createContainer(azuriteRequest)
            .then((response) => {
                response.send(res);
            });
    }
}

module.exports = new CreateContainer();
