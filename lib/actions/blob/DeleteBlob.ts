const storageManager = require("./../../core/blob/StorageManager");

class DeleteBlob {
    constructor() {
    }

    process(azuriteRequest, res) {
        storageManager.deleteBlob(azuriteRequest)
            .then((response) => {
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

module.exports = new DeleteBlob();