

const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
    tableStorageManager = require("./../../core/table/TableStorageManager"),
    N = require("./../../core/HttpHeaderNames");

class InsertOrReplaceEntity {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.insertEntity(request)
            .then((response) => {
                response.addHttpProperty(N.ETAG, response.proxy.etag);
                res.set(response.httpProps);
                res.status(204).send();
            });
    }
}

export default new InsertOrReplaceEntity;