'use strict';

/**
 * The in-memory DB of Azurite serves as the exclusive source of truth for every validation.
 * Since the validation is synchronous / single-threaded we can be certain about the exact state of the entire
 * application after @see ValidationContext exits.
 * 
 * In case a validation fails an according @see AzuriteException is thrown which is then expected
 * to be processed by the responsible API Handler.
 * 
 * A validation module should only need the Azurite request object and the container/blob-proxy1 
 *  
 * @class ValidationContext
 */
class ValidationContext {
    constructor({ request = null, proxy = null }) {
        this.request = request;
        this.proxy = proxy;
    }

    /**
     * Runs a validation module.
     * 
     * @param {Object} valModule
     * @param {Object} moduleOptions - allows a validation module to selectively add attributes
     * @param {boolean} skip - if set to true validation module is not run.
     * @returns this
     * 
     * @memberOf ValidationContext
     */
    run(valModule, moduleOptions, skip) {
        if (skip) {
            return this;
        }
        valModule.validate({ request: this.request, proxy: this.proxy, moduleOptions: moduleOptions });
        return this;
    }
}

module.exports = ValidationContext;