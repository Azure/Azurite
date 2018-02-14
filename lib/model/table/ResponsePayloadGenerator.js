'use strict'

const IAError = require('./../../core/InternalAzuriteError');

class ResponsePayLoadGenerator {
    constructor() {
    }

    generate(accept) {
        if (accept === `application/atom+xml`) {
            throw new IAError(`accept value of 'atom+xml' is currently not supported by Azurite`);
        }

        if (accept.contains(`application/json`)) {
            return 'json';
        }

        // This should never happen! (should be catched by validation pipeline)
        throw new IAError(`accept value ${accept} is not supported by Azurite.`)
    }
}

module.exports = new ResponsePayLoadGenerator;

