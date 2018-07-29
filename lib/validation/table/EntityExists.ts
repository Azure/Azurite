const AError = from "./../../core/AzuriteError"),
  ErrorCodes = from "./../../core/ErrorCodes");

class EntityExists {
  public validate({ entity = undefined }) {
    if (entity === undefined) {
      throw new AError(ErrorCodes.ResourceNotFound);
    }
  }
}

export default new EntityExists();
