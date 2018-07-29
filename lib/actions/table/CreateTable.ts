

const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
    tableStorageManager = require("./../../core/table/TableStorageManager"),
    N = require("./../../core/HttpHeaderNames");

class CreateTable {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.createTable(request)
        .then((response) => {
            res.set(request.httpProps);
            if (request.httpProps[N.PREFER] === "return-no-content") {
                response.addHttpProperty(N.PREFERENCE_APPLIED, "return-no-content");
                res.status(204).send();
                return;
            }
            response.addHttpProperty(N.PREFERENCE_APPLIED, "return-content");
            res.status(201).send(response.proxy.odata(request.accept));
        });
    }
}

export default new CreateTable();