import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
/**
 * Validates the correct number space of the number of messages query parameter "numofmessages".
 * Parameter must be a non-zero integer n with 1 <= n <= 32
 */
class NumOfMessages {
  public validate(request) {
    if (request.numOfMessages < 1 || request.numOfMessages > 32) {
      throw new AzuriteError(ErrorCodes.OutOfRangeInput);
    }
  }
}

export default new NumOfMessages();
