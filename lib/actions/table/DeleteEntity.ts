

const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
    tableStorageManager = require("./../../core/table/TableStorageManager"),
    N = require("./../../core/HttpHeaderNames");

class DeleteEntity {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.deleteEntity(request)
            .then((response) => {
                res.set(request.httpProps);
                res.status(204).send();
            });
    }
}

export default new DeleteEntity;