/** @format */

"use strict";

import storageManager from './../../core/blob/StorageManager';

class CreateContainer {
  constructor() {}

    process(azuriteRequest, res) {
        storageManager.createContainer(azuriteRequest)
            .then((response) => {
                response.send(res);
            });
    }
}

export default new CreateContainer();
