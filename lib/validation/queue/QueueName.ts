const AError = from "./../../core/AzuriteError"),
  ErrorCodes = from "./../../core/ErrorCodes");

/*
 * Checks whether the queue name adheres to the naming convention
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/naming-queues-and-metadata
 */
class QueueName {
  public validate({ request = undefined }) {
    const name = request.queueName;
    if (name.length < 3 || name.length > 63) {
      throw new AError(ErrorCodes.OutOfRangeInput);
    }

    if (/^([a-z0-9]+)(-[a-z0-9]+)*$/i.test(name) === false) {
      throw new AError(ErrorCodes.InvalidInput);
    }
  }
}

export default new QueueName();
