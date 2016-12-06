'use strict';

const storageManager = require('./../StorageManager'),
      js2xmlparser = require("js2xmlparser"),
      model = require('./../model/ContainerList');

class ListContainers {
    constructor(){
    }

    process(req, res) {
        const prefix = req.params.prefix || '',
              maxresults = req.params.maxresults || "5000",
              includeMetadata = (req.params.include === 'metadata') ? true : false;
        storageManager.listContainer(prefix, maxresults)
            .then((containers) => {
                this._addResponseHeaders(res);
                let transformedModel = this._transformContainerList(containers, includeMetadata);
                let xmlDoc = js2xmlparser.parse('EnumerationResults', transformedModel);
                res.status(200).send(xmlDoc);
            })
            .catch((e) => {
                console.error('ListContainers operation failed.\n' + JSON.stringify(e));
                res.status(500).send();
            });
    }

    _transformContainerList(containers, includeMetadata) {
        let model = new model.ContainerList();
        // TODO: init blabla attributes
        for(container of containers) {
            if (!includeMetadata) {
                delete container.metaProps;
            }
            // TODO: add container representation
        }
    }

    _addResponseHeaders(res) {
        res.set({
            'Content-Type': 'application/xml',
            'ETag': props.ETag,
            'Last-Modified': props.lastModified,
            'x-ms-version': '2013-08-15',
        });
    }
}

module.exports = new ListContainers;