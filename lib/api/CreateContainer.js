'use strict';

const storageManager = require('./../StorageManager'),
    Container = require('./../model/Container'),
    ContainerHttpProperties = require('./../model/ContainerHttpProperties');

class CreateContainer {
    constructor() {
    }

    process(req, res) {
        const containerName = req.params.container;
        let containerModel = this._buildContainerModel(req, containerName); 
        storageManager.createContainer(containerModel)
            .then((result) => {
                this._addResponseHeaders(res, containerModel.httpProps)
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

    _buildContainerModel(req, containerName) {
        let optional = {};
        if(req.headers['x-ms-blob-public-access']) {
            optional.access = req.headers['x-ms-blob-public-access'];
        }
        let container = new Container(containerName, new ContainerHttpProperties(), {}, optional);
        Object.keys(req.headers).forEach((key) => {
            let value = req.headers[key];
            if (key.indexOf('x-ms-meta') !== -1) {
                container.metaProps[key] = value;
            }
        });
        return container;
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