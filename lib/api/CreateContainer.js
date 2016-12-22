'use strict';

const storageManager = require('./../StorageManager'),
    Container = require('./../model/Container');

class CreateContainer {
    constructor() {
    }

    process(req, res, containerName) {
        const container = new Container(containerName, req.headers)
        storageManager.createContainer(container)
            .then((result) => {
                this._addResponseHeaders(res, container.httpProps)
                res.status(200).send();
            })
            .catch((e) => {
                if (e.code === "EEXIST") {
                    res.status(409).send();
                } else {
                    res.status(500).send();
                    // We throw and thus abort this process since our database might be corrupted.
                    throw e;
                }
            });
    }

    _addResponseHeaders(res, props) {
        res.set({
            'ETag': props.ETag,
            'Last-Modified': props.lastModified,
            'x-ms-version': '2011-08-18',
        });  
    }
}

module.exports = new CreateContainer();