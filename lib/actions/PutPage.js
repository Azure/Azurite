'use strict';

const storageManager = require('./../StorageManager'),
    N = require('./../model/HttpHeaderNames'),
    StandardHandler = require('./StandardHandler');

class PutPage extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        return storageManager.putPage(request)
            .then((response) => {
                response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
                res.set(response.httpProps);
                res.status(201).send();
            });
    }
}

module.exports = new PutPage();