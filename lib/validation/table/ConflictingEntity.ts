import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";

class ConflictingEntity {
  public validate(entity) {
    if (entity !== undefined) {
      throw new AzuriteError(ErrorCodes.EntityAlreadyExists);
    }
  }
}

export default new ConflictingEntity();
