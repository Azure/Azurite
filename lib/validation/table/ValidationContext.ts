/**
 * The in-memory DB of Azurite serves as the exclusive source of truth for every validation.
 * Since the validation is synchronous / single-threaded we can be certain about the exact state of the entire
 * application before and after @see ValidationContext exits.
 *
 * In case a validation fails an according @see AzuriteException is thrown which is then processed
 * by the validation middleware module middleware/table/validation.js
 *
 * @class ValidationContext
 */
class ValidationContext {
  public request: any;
  public table: any;
  public entity: any;
  constructor({ request, table, entity }) {
    this.request = request;
    this.table = table;
    this.entity = entity;
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
      entity: moduleOptions ? moduleOptions.entity || this.entity : this.entity,
      moduleOptions,
      request: moduleOptions
        ? moduleOptions.request || this.request
        : this.request,
      table: moduleOptions ? moduleOptions.table || this.table : this.table
    });
    return this;
  }
}

export default ValidationContext;
