

const storageManager = require("./../../core/blob/StorageManager");

class SetBlobMetadata {
    constructor() {
    }

    process(request, res) {
        storageManager.setBlobMetadata(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

export default new SetBlobMetadata();