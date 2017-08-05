'use strict';

const storageManager = require('./../StorageManager'),
    BaseHandler = require('./BaseHandler');

class StandardHandler {
    constructor() {
    }

    process(request, res, func) {
        func(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(response.statusCode).send();
            });
    }
}

module.exports = new BaseHandler(new StandardHandler());