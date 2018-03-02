'use strict';

const AzuriteTableResponse = require('./../../model/table/AzuriteTableResponse'),
    tableStorageManager = require('./../../core/table/TableStorageManager'),
    N = require('./../../core/HttpHeaderNames');

class QueryTable {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.queryTable(request)
        .then((response) => {
            res.set(request.httpProps);
            res.status(200).send();
        });
    }
}

module.exports = new QueryTable();