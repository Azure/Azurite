'use strict'

const IAError = require('./../../core/InternalAzuriteError');

class RequestPayLoadParser {
    constructor() {
    }

    parse(contentType, body) {
        switch (contentType) {
            case 'application/atom+xml':
                throw new IAError(`accept value of 'atom+xml' is currently not supported by Azurite`);
                break;
            case 'application/json':
                const txt = body.toString('utf8');
                return JSON.parse(txt);
                break;
            default:
                // This should never happen! (should be catched by validation pipeline)
                throw new IAError(`content-type value ${contentType} is not supported by Azurite.`)
        }
    }
}

module.exports = new RequestPayLoadParser;

