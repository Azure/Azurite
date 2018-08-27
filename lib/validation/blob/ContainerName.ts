import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";

/*
 * Checks whether the container name adheres to the naming convention
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/naming-and-referencing-containers--blobs--and-metadata
 */
class ContainerName {
  public validate(request) {
    const name = request.containerName;
    if (name === "$root") {
      return;
    }
    if (name.length < 3 || name.length > 63) {
      throw new AzuriteError(ErrorCodes.OutOfRangeInput);
    }
    if (/^([a-z0-9]+)(-[a-z0-9]+)*$/i.test(name) === false) {
      throw new AzuriteError(ErrorCodes.InvalidInput);
    }
  }
}

export default new ContainerName();
