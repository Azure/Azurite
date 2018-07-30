import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";

/*
 * Checks whether the queue name adheres to the naming convention
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/naming-queues-and-metadata
 */
class QueueMessageSize {
  public validate(request) {
    if (request.bodyLength > 64000) {
      throw new AzuriteError(ErrorCodes.MessageTooLarge);
    }
  }
}

export default new QueueMessageSize();
