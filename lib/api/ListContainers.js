'use strict';

const storageManager = require('./../StorageManager'),
    js2xmlparser = require("js2xmlparser"),
    ResponseHeader = require('./../model/ResponseHeader'),
    model = require('./../model/ContainerListXmlModel');

class ListContainers {
    constructor() {
    }

    process(req, res) {
        const prefix = req.query.prefix || '',
            maxresults = req.query.maxresults || "5000",
            includeMetadata = (req.query.include === 'metadata') ? true : false,
            marker = req.query.marker || '';
        storageManager.listContainer(prefix, maxresults)
            .then((containers) => {
                res.set(new ResponseHeader({'Content-Type': 'application/xml'}));
                let transformedModel = this._transformContainerList(containers, includeMetadata, prefix, maxresults, marker);
                let xmlDoc = js2xmlparser.parse('EnumerationResults', transformedModel);
                xmlDoc = xmlDoc.replace(`<EnumerationResults>`, `<EnumerationResults ServiceEndpoint="http://localhost:10000/devstoreaccount1">`);
                xmlDoc = xmlDoc.replace(`<?xml version='1.0'?>`, `<?xml version="1.0" encoding="utf-8"?>`);
                xmlDoc = xmlDoc.replace(/\>[\s]+\</g, '><');
                // Forcing Express.js to not touch the charset of the buffer in order to remove charset=utf-8 as part of the content-type
                res.status(200).send(new Buffer(xmlDoc));
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }

    _transformContainerList(containers, includeMetadata, prefix, maxresults, marker) {
        let xmlContainerListModel = new model.ContainerList();
        (prefix === '') ? delete xmlContainerListModel.Prefix : xmlContainerListModel.Prefix = prefix;
        (maxresults === '') ? delete xmlContainerListModel.MaxResults : xmlContainerListModel.MaxResults = maxresults;
        (marker === '') ? delete xmlContainerListModel.Marker : xmlContainerListModel.Marker = marker;
        // Fixme: We do not support markers yet 
        delete xmlContainerListModel.NextMarker;
        for (let container of containers) {
            let modelContainer = new model.Container(container.name);
            xmlContainerListModel.Containers.Container.push(modelContainer);
            if (!includeMetadata || Object.keys(container.metaProps).length === 0) {
                delete modelContainer.Metadata;
            } else {
                modelContainer.Metadata = container.metaProps;
            }
            modelContainer.Properties['Last-Modified'] = container.httpProps["Last-Modified"];
            modelContainer.Properties.ETag = container.httpProps.ETag;
        }
        return xmlContainerListModel;
    }
}

module.exports = new ListContainers;