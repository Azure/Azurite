'use strict';

class AzuriteTableRequest {
    constructor({
        req = undefined,
        payload = undefined }) {

        if (req === undefined) {
            throw new InternalAzuriteError('AzuriteTableRequest: req must not be undefined!');
        }

        this.httpProps = {};

        
        

        this._initHttpProps(req.headers);
    }

    _initHttpProps(httpHeaders) {
        
    }
}

module.exports = AzuriteTableRequest;