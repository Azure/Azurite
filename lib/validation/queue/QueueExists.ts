import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";

class QueueExists {
  public validate(request, queue) {
    if (queue === undefined) {
      throw new AzuriteError(ErrorCodes.QueueNotFound);
    }
  }
}

export default new QueueExists();
