'use strict';

const AzuriteTableResponse = require('./../../model/table/AzuriteTableResponse'),
    N = require('./../../core/HttpHeaderNames');

class CreateTable {
    constructor() {
    }

    process(request, res) {
        const response = new AzuriteTableResponse();
        if (request.httpProps[N.PREFER] === 'return-no-content') {
            response.addHttpProperty(N.PREFERENCE_APPLIED, 'return-no-content');
            res.status(204).send();
            return;
        }

        response.addHttpProperty(N.PREFERENCE_APPLIED, 'return-content');
        res.status(201).send();
    }
}

module.exports = new CreateTable();