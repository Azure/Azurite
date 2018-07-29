

const AError = require("./../../core/AzuriteError"),
    ErrorCodes = require("./../../core/ErrorCodes");

/**
 * Validates the correct number space of the number of messages query parameter "numofmessages".
 * Parameter must be a non-zero integer n with 1 <= n <= 32
 */
class NumOfMessages {
    constructor() {
    }

    validate({ request = undefined }) {
        if (request.numOfMessages < 1 || request.numOfMessages > 32) {
            throw new AError(ErrorCodes.OutOfRangeInput);
        }
    }
}

export default new NumOfMessages();