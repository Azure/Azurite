constimport AError from "./../../core/AzuriteError";
  ErrorCodes  from "./../../core/ErrorCodes");

/*
 * Checks whether the container that is to be created already exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ConflictingContainer {
  public validate({ containerProxy = undefined }) {
    if (containerProxy !== undefined) {
      throw new AError(ErrorCodes.ContainerAlreadyExists);
    }
  }
}

export default new ConflictingContainer();
