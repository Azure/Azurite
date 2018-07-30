import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
/*
 * Checks whether the container exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ContainerExists {
  public validate(containerProxy) {
    if (containerProxy === undefined) {
      throw new AzuriteError(ErrorCodes.ContainerNotFound);
    }
  }
}

export default new ContainerExists();
