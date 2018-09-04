/** @format */

"use strict";

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
  constructor({
    request = undefined,
    queue = undefined,
    message = undefined,
    operation = undefined,
  }) {
    this.request = request;
    this.queue = queue;
    (this.message = message), (this.operation = operation);
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
  run(valModule, moduleOptions, skip) {
    if (skip) {
      return this;
    }
    valModule.validate({
      request: moduleOptions
        ? moduleOptions.request || this.request
        : this.request,
      queue: moduleOptions ? moduleOptions.queue || this.queue : this.queue,
      message: moduleOptions
        ? moduleOptions.message || this.message
        : this.message,
      operation: moduleOptions
        ? moduleOptions.operation || this.operation
        : this.operation,
      moduleOptions: moduleOptions,
    });
    return this;
  }
}

export default ValidationContext;
