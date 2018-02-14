'use strict'

const IAError = require('./../../core/InternalAzuriteError');

class RequestPayLoadParser {
    constructor() {
    }

    parse(contentType) {
        if (contentType === `application/atom+xml`) {
            throw new IAError(`accept value of 'atom+xml' is currently not supported by Azurite`);
        }

        // content-type must be application/json;odata={nometadata|minimalmetadata|fullnetadata} since different values
        // are detected by validation pipeline

        if (contentType.contains(`application/json`)) {
            return 'json';
        }

        // This should never happen! (should be catched by validation pipeline)
        throw new IAError(`content-type value ${contentType} is not supported by Azurite.`)
    }
}

module.exports = new RequestPayLoadParser;

