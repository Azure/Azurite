import AzuriteRequest from "./AzuriteRequest";

const path = from "path"),
  env = from "./../../core/env"),
  EntityType = from "./../../core/Constants").StorageEntityType;

class AzuriteContainerRequest extends AzuriteRequest {
  public containerName: string;
  constructor(req, payload?: any) {
    super({
      req,
      entityType: EntityType.Container,
      payload
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
  public fullPath() {
    return path.join(env.localStoragePath, this.containerName);
  }
}

export default AzuriteContainerRequest;
