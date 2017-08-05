'use strict';

const BbPromise = require('bluebird');

class BaseHandler {
    constructor(handler) {
        this.handler = handler;
    }

    process(request, res, func) {
        BbPromise.try(() => {
            this.handler.process(request, res, func);
        }).catch((e) => {
            res.status(e.statusCode || 500).send(e.message);
            if (!e.statusCode) throw e;
        });
    }
}

module.exports = BaseHandler;