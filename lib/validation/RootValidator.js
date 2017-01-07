'use strict';

/**
 * The in-memory DB of Azurite serves as the exclusive source of truth for every validation.
 * Since the validation is synchronous we can be certain about the exact state of the entire
 * application after @see RootValidator exits.
 * 
 * In case a validation fails an according @see AzuriteException is thrown which is then expected
 * to be processed by the responsible API Handler.
 * 
 * @class RootValidator
 */
class RootValidator {
    constructor(options) {
        this.options = options || {};
    }

    /**
     * Runs a validation module.
     * 
     * @param {Object} valModule
     * @param {Object} moduleOptions - allows a validation module to selectively 
     * overwrite or add attributes
     * @param {boolean} skip - if set to true validation module is not run.
     * @returns this
     * 
     * @memberOf RootValidator
     */
    run(valModule, moduleOptions, skip) {
        if (skip) {
            return this;
        }
        if (moduleOptions) {
            for (const key of Object.keys(this.options)) {
                if (moduleOptions[key]) {
                    continue;
                }
                moduleOptions[key] = this.options[key];
            }
        }
        valModule.validate(moduleOptions || this.options);
        return this;
    }
}

module.exports = RootValidator;