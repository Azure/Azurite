const storageManager = require("./../../core/blob/StorageManager"),
    N = require("./../../core/HttpHeaderNames");

class AbortCopyBlob {
    constructor() {
    }

    process(azuriteRequest, res) {
        storageManager.copyBlob(azuriteRequest)
            .then((response) => {
                res.status(204).send();
            });
    }
}

export default new AbortCopyBlob();