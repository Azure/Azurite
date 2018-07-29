

const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
    tableStorageManager = require("./../../core/table/TableStorageManager"),
    N = require("./../../core/HttpHeaderNames");

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