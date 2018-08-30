/** @format */

"use strict";

const path = require("path"),
  env = require("./../../core/env"),
  EntityType = require("./../../core/Constants").StorageEntityType,
  AzuriteRequest = require("./AzuriteRequest");

class AzuriteContainerRequest extends AzuriteRequest {
  constructor({ req = null, payload = undefined }) {
    super({
      req: req,
      entityType: EntityType.Container,
      payload: payload,
    });

    this.containerName = req.params.container;
  }

  /**
   * Returns the full path on disk where the container (directory) will be created
   * (e.g. /home/user1/azurite-workspace/__blobstorage__/my-container)
   *
   * @returns full path to container
   * @memberof AzuriteContainerRequest
   */
  fullPath() {
    return path.join(env.localStoragePath, this.containerName);
  }
}

module.exports = AzuriteContainerRequest;
