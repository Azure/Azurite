import AzuriteError from "../../core/AzuriteError";
import { Operations } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";

/*
 * Checks whether the visibility timeout value adheres to the specifications at
 * https://docs.microsoft.com/en-us/rest/api/storageservices/update-message
 * and https://docs.microsoft.com/en-us/rest/api/storageservices/get-messages
 */
class VisibilityTimeoutValue {
  public validate(request, operation, message) {
    if (operation === Operations.Queue.GET_MESSAGE) {
      if (
        request.visibilityTimeout < 1 ||
        request.visibilityTimeout > 60 * 60 * 24 * 7
      ) {
        throw new AzuriteError(ErrorCodes.OutOfRangeInput);
      }
    } else {
      if (
        request.visibilityTimeout < 0 ||
        request.visibilityTimeout > 60 * 60 * 24 * 7
      ) {
        throw new AzuriteError(ErrorCodes.OutOfRangeInput);
      }
      if (operation === Operations.Queue.PUT_MESSAGE) {
        if (
          request.now + request.visibilityTimeout >
          request.now + request.messageTtl
        ) {
          throw new AzuriteError(ErrorCodes.OutOfRangeInput);
        }
      }
      if (operation === Operations.Queue.UPDATE_MESSAGE) {
        if (request.now + request.visibilityTimeout > message.expirationTime) {
          throw new AzuriteError(ErrorCodes.OutOfRangeInput);
        }
      }
    }
  }
}

export default new VisibilityTimeoutValue();
