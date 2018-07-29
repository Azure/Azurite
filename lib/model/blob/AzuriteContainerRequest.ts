import AzuriteRequest from "./AzuriteRequest";

const path = require("path"),
  env = require("./../../core/env"),
  EntityType = require("./../../core/Constants").StorageEntityType;

class AzuriteContainerRequest extends AzuriteRequest {
  containerName: string;
  constructor(req, payload?: any) {
    super({
      req: req,
      entityType: EntityType.Container,
      payload: payload
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

export default AzuriteContainerRequest;
