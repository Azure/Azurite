'use strict';

/**
 * The in-memory DB of Azurite serves as the exclusive source of truth for every validation.
 * Since the validation is synchronous / single-threaded we can be certain about the exact state of the entire
 * application before and after @see ValidationContext exits.
 * 
 * In case a validation fails an according @see AzuriteException is thrown which is then processed
 * by the validation middleware module middleware/blob/validation.js
 * 
 * @class ValidationContext
 */
class ValidationContext {
    constructor({ request = undefined, containerProxy = undefined, blobProxy = undefined }) {
        this.request = request;
        this.containerProxy = containerProxy;
        this.blobProxy = blobProxy;
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
            request: moduleOptions ? moduleOptions.request || this.request : this.request, 
            containerProxy: moduleOptions ? moduleOptions.containerProxy || this.containerProxy : this.containerProxy, 
            blobProxy: moduleOptions ? moduleOptions.blobProxy || this.blobProxy : this.blobProxy, 
            moduleOptions: moduleOptions });
        return this;
    }
}

module.exports = ValidationContext;