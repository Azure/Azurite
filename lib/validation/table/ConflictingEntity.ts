const AError = from "./../../core/AzuriteError"),
  ErrorCodes = from "./../../core/ErrorCodes");

class ConflictingEntity {
  public validate({ entity = undefined }) {
    if (entity !== undefined) {
      throw new AError(ErrorCodes.EntityAlreadyExists);
    }
  }
}

export default new ConflictingEntity();
