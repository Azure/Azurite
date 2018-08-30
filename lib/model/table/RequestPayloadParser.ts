/** @format */

import IAzuriteError from './../../core/InternalAzuriteError';

class RequestPayLoadParser {
  constructor() {}

    parse(contentType, body) {
        if (!body.length || body.length === 0) {
            return {};
        }
        switch (contentType) {
            case 'application/atom+xml':
            case 'application/atom+xml;':
                throw new IAzuriteError(`accept value of 'atom+xml' is currently not supported by Azurite`);
                break;
            case 'application/json':
            case 'application/json;':
                const txt = body.toString('utf8');
                return JSON.parse(txt);
                break;
            default:
                // This should never happen! (should be catched by validation pipeline)
                throw new IAzuriteError(`content-type value ${contentType} is not supported by Azurite.`)
        }
    }
  }
}

export default new RequestPayLoadParser;

