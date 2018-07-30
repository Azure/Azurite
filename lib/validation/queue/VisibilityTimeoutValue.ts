constimport AError from "./../../core/AzuriteError";
  Operations  from "./../../core/Constants").Operations.Queue,
  ErrorCodes  from "./../../core/ErrorCodes");

/*
 * Checks whether the visibility timeout value adheres to the specifications at
 * https://docs.microsoft.com/en-us/rest/api/storageservices/update-message
 * and https://docs.microsoft.com/en-us/rest/api/storageservices/get-messages
 */
class VisibilityTimeoutValue {
  public validate({
    request = undefined,
    operation = undefined,
    message = undefined
  }) {
    if (operation === Operations.GET_MESSAGE) {
      if (
        request.visibilityTimeout < 1 ||
        request.visibilityTimeout > 60 * 60 * 24 * 7
      ) {
        throw new AError(ErrorCodes.OutOfRangeInput);
      }
    } else {
      if (
        request.visibilityTimeout < 0 ||
        request.visibilityTimeout > 60 * 60 * 24 * 7
      ) {
        throw new AError(ErrorCodes.OutOfRangeInput);
      }
      if (operation === Operations.PUT_MESSAGE) {
        if (
          request.now + request.visibilityTimeout >
          request.now + request.messageTtl
        ) {
          throw new AError(ErrorCodes.OutOfRangeInput);
        }
      }
      if (operation === Operations.UPDATE_MESSAGE) {
        if (request.now + request.visibilityTimeout > message.expirationTime) {
          throw new AError(ErrorCodes.OutOfRangeInput);
        }
      }
    }
  }
}

export default new VisibilityTimeoutValue();
