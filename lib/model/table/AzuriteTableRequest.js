'use strict';

class AzuriteTableRequest {
    constructor(req = undefined) {
        if (req === undefined) {
            throw new InternalAzuriteError('AzuriteTableRequest: req must not be undefined!');
        }
        // req.params
        
    }
}

module.exports = AzuriteTableRequest;