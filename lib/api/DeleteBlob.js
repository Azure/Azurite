'use strict';

const storageManager = require('./../StorageManager');

class DeleteBlob {
    constructor(){
    }

    process(req, res, container, blob) {
        storageManager.deleteBlob(container, blob)
            .then((result) => {
                console.log(`Successfully deleted ${container}/${blob}`);
                res.status(202).send();
            })
            .catch((e) => {
                if (e.code === "ENOENT") {
                    console.error(`Blob ${container}/${blob} does not exist.`);
                    res.status(404).send('BlobNotFound');
                } else {
                    res.status(500).send();
                    throw e;
                }
            });
    }

    _addResponseHeaders(res) {
        res.set({
            'x-ms-version': '2011-08-18'
        });  
    }
}

module.exports = new DeleteBlob();