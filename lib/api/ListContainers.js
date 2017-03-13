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
                res.set(new ResponseHeader({'Content-Type':'application/xml'}));
                let transformedModel = this._transformContainerList(containers, includeMetadata, prefix, maxresults, marker);
                let xmlDoc = js2xmlparser.parse('EnumerationResults', transformedModel);
                xmlDoc = xmlDoc.replace(`<?xml version='1.0'?>`, `<?xml version="1.0" encoding="utf-8"?>`)
                res.status(200).send(xmlDoc);
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
            if (!includeMetadata) {
                delete modelContainer.Metadata;
            } else {
                this._addMetadata(modelContainer, container.metaProps);
            }
            modelContainer.Properties['Last-Modified'] = container.httpProps.lastModified;
            modelContainer.Properties.ETag = container.httpProps.ETag;
        }
        return xmlContainerListModel;
    }

    _addMetadata(modelContainer, metaProps) {
        Object.keys(metaProps).forEach((key) => {
            let value = metaProps[key];
            key = 'metadata-' + key;
            modelContainer.Metadata[key] = value;
        });
    }
}

module.exports = new ListContainers;