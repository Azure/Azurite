constimport AError from "./../../core/AzuriteError";
  ErrorCodes  from "./../../core/ErrorCodes");

/*
 * Checks whether the container exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ContainerExists {
  public validate({ containerProxy = undefined }) {
    if (containerProxy === undefined) {
      throw new AError(ErrorCodes.ContainerNotFound);
    }
  }
}

export default new ContainerExists();
