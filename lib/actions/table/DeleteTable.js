'use strict';

import AzuriteTableResponse from './../../model/table/AzuriteTableResponse';
import tableStorageManager from './../../core/table/TableStorageManager';
import N from './../../core/HttpHeaderNames';

class DeleteTable {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.deleteTable(request)
            .then((response) => {
                res.set(request.httpProps);
                res.status(201).send();
            });
    }
}

export default new DeleteTable;