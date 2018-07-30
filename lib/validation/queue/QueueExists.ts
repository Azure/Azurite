constimport AError from "./../../core/AzuriteError";
  ErrorCodes  from "./../../core/ErrorCodes");

class QueueExists {
  public validate({ request = undefined, queue = undefined }) {
    if (queue === undefined) {
      throw new AError(ErrorCodes.QueueNotFound);
    }
  }
}

export default new QueueExists();
