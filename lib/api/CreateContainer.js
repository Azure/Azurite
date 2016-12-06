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
                console.log(`Successfully created container "${containerName}"`);
                res.status(200).send();
            })
            .catch((e) => {
                if (e.code === "EEXIST") {
                    console.error(`Container ${containerName} already exists.`);
                    res.status(409).send();
                } else {
                    res.status(500).send();
                    throw e;
                }
            });
    }

    _buildContainerModel(req, containerName) {
        let container = new Container(containerName, new ContainerHttpProperties());
        Object.keys(req.headers).forEach((key) => {
            let value = req.headers[key];
            if (key.indexOf('x-ms-meta') !== -1) {
                container.props[key] = value;
            }
        });
        return container;
    }
}

module.exports = new CreateContainer();