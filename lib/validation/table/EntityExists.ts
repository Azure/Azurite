import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";

class EntityExists {
  public validate(entity) {
    if (entity === undefined) {
      throw new AzuriteError(ErrorCodes.ResourceNotFound);
    }
  }
}

export default new EntityExists();
