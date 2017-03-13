'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader');

class GetContainerProperties {
    constructor() {
    }

    process(req, res, containerName) {
        return storageManager.getContainerProperties(containerName)
            .then((result) => {
                res.set(new ResponseHeader(result.httpProps, 
                                           result.metaProps,
                                           {
                                               'x-ms-lease-status': 'available',
                                               'x-ms-lease-state': 'available' 
                                           }));
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new GetContainerProperties();