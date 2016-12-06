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
                this._addResponseHeaders(res, containerModel.props)
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
        let optional = {};
        if(req.headers['x-ms-blob-public-access']) {
            optional.access = req.headers['x-ms-blob-public-access'];
        }
        let container = new Container(containerName, new ContainerHttpProperties(), optional);
        Object.keys(req.headers).forEach((key) => {
            let value = req.headers[key];
            if (key.indexOf('x-ms-meta') !== -1) {
                container.props[key] = value;
            }
        });
        return container;
    }

    _addResponseHeaders(res, props) {
        res.set({
            'ETag': props.ETag,
            'Last-Modified': props.lastModified,
            'x-ms-version': '2011-08-18',
        })
        // headers['ETag'] = props.ETag;
        // headers['Last-Modified'] = props.LastModified;
        // headers['x-ms-version'] = '2011-08-18';
        // headers['Date'] = new Date().toGMTString();  
    }
}

module.exports = new CreateContainer();