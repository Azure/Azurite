import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
/*
 * Checks whether the container that is to be created already exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ConflictingContainer {
  public validate(request, containerProxy, moduleOptions) {
    if (containerProxy !== undefined) {
      throw new AzuriteError(ErrorCodes.ContainerAlreadyExists);
    }
  }
}

export default new ConflictingContainer();
