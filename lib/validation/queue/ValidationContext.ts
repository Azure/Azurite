/**
 * The state of all queues and messages is kept in memory only.
 * Since the validation is synchronous / single-threaded we can be certain about the exact state of the entire
 * application before and after @see ValidationContext exits.
 *
 * In case a validation fails an according @see AzuriteException is thrown which is then processed
 * by the validation middleware module middleware/queue/validation.js
 *
 * @class ValidationContext
 */
class ValidationContext {
  public request: any;
  public queue: any;
  public message: any;
  public operation: any;
  constructor({ request, queue, message, operation }) {
    this.request = request;
    this.queue = queue;
    this.message = message;
    this.operation = operation;
  }

  /**
   * Runs a validation module.
   *
   * @param {Object} valModule
   * @param {Object} moduleOptions - allows a validation module to selectively add attributes or overwrite them
   * @param {boolean} skip - if set to true validation module is not run.
   * @returns this
   *
   * @memberOf ValidationContext
   */
  public run(valModule, moduleOptions, skip) {
    if (skip) {
      return this;
    }
    valModule.validate({
      message: moduleOptions
        ? moduleOptions.message || this.message
        : this.message,
      moduleOptions,
      operation: moduleOptions
        ? moduleOptions.operation || this.operation
        : this.operation,
        queue: moduleOptions ? moduleOptions.queue || this.queue : this.queue,
        request: moduleOptions
        ? moduleOptions.request || this.request
        : this.request,
    });
    return this;
  }
}

export default ValidationContext;
