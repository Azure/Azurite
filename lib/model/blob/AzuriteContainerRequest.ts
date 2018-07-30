import * as path from "path";
import { StorageEntityType } from "../../core/Constants";
import env from "../../core/env";
import AzuriteRequest from "./AzuriteRequest";

class AzuriteContainerRequest extends AzuriteRequest {
  public containerName: string;
  constructor(req, payload?: any) {
    super({
      entityType: StorageEntityType.Container,
      payload,
      req
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
