'use strict';

const BbPromise = require('bluebird'),
    InternalAzuriteError = require('./../InternalAzuriteError');

class StandardHandler {
    constructor() {
    }

    process(request, res, func) {
        BbPromise.try(() => {
            this.processImpl(request, res);
        }).catch((e) => {
            res.status(e.statusCode || 500).send(e.message);
            if (!e.statusCode) throw e;
        });
    }

    processImpl() {
        throw new InternalAzuriteError('processImpl not implemented.'); 
    }
}

module.exports = StandardHandler;