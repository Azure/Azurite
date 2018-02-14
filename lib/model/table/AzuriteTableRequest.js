'use strict';

const InternalAzuriteError = require('./../../core/InternalAzuriteError'),
    RequestPayloadParser = require('./RequestPayloadParser'),
    N = require('./../../core/HttpHeaderNames');

class AzuriteTableRequest {
    constructor({
        req = undefined,
        payload = undefined }) {

        if (req === undefined) {
            throw new InternalAzuriteError('AzuriteTableRequest: req must not be undefined!');
        }
        this.httpProps = {};
        this._initHttpProps(req.headers);
        this.payload = RequestPayloadParser.parse(this.httpProps[N.ACCEPT]);


        
        

    }

    _initHttpProps(httpHeaders) {
        this.httpProps[N.ACCEPT] = httpHeaders[N.ACCEPT] || `application/json;odata=nometadata`;        
        this.httpProps[N.PREFER] = httpHeaders[N.ACCEPT] || undefined;
    }
}

module.exports = AzuriteTableRequest;