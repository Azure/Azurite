'use strict';

const storageManager = require('./../StorageManager'),
      js2xmlparser = require("js2xmlparser"),
      model = require('./../model/ContainerListXmlModel');

class ListContainers {
    constructor(){
    }

    process(req, res) {
        const prefix = req.query.prefix || '',
              maxresults = req.query.maxresults || "5000",
              includeMetadata = (req.query.include === 'metadata') ? true : false,
              marker = req.query.marker || '';
        storageManager.listContainer(prefix, maxresults)
            .then((containers) => {
                this._addResponseHeaders(res);
                let transformedModel = this._transformContainerList(containers, includeMetadata, prefix, maxresults, marker);
                let xmlDoc = js2xmlparser.parse('EnumerationResults', transformedModel);
                res.status(200).send(xmlDoc);
            })
            .catch((e) => {
                res.status(500).send();
            });
    }

    _transformContainerList(containers, includeMetadata, prefix, maxresults, marker) {
        let xmlContainerListModel = new model.ContainerList();
        (prefix === '') ? delete xmlContainerListModel.prefix : xmlContainerListModel.prefix = prefix;
        (maxresults === '') ? delete xmlContainerListModel.maxResults : xmlContainerListModel.maxResults = maxresults;
        (marker === '') ? delete xmlContainerListModel.marker : xmlContainerListModel.marker = marker;
        // Fixme: We do not support markers yet 
        delete xmlContainerListModel.nextMarker;
        for(let container of containers) {
            let modelContainer = new model.Container(container.name);
            xmlContainerListModel.containers.container.push(modelContainer);
            if (!includeMetadata) {
                delete modelContainer.metadata;
            } else {
                this._addMetadata(modelContainer, container.meta_props);
            }
            modelContainer.properties['Last-Modified'] = container.http_props.lastModified;
            modelContainer.properties.ETag = container.http_props.ETag;
        }
        return xmlContainerListModel;
    }

    _addMetadata(modelContainer, metaProps) {
        Object.keys(metaProps).forEach((key) => {
            let value = metaProps[key];
            key = 'metadata-' + key;
            modelContainer.metadata[key] = value;
        }); 
    }

    _addResponseHeaders(res) {
        res.set({
            'Content-Type': 'application/xml',
            'x-ms-version': '2013-08-15',
        });
    }
}

module.exports = new ListContainers;