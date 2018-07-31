import * as path from "path";
import { StorageEntityType } from "../../core/Constants";
import Environment from "../../core/env";
import AzuriteRequest from "./AzuriteRequest";

class AzuriteContainerRequest extends AzuriteRequest {
  public containerName: string;
  constructor(req, payload?: any) {
    super(req, StorageEntityType.Container, payload);

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
    return path.join(Environment.localStoragePath, this.containerName);
  }
}

export default AzuriteContainerRequest;
