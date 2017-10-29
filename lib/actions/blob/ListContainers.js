'use strict';

const storageManager = require('./../../StorageManager'),
    js2xmlparser = require("js2xmlparser"),
    model = require('./../../xml/blob/ContainerListXmlModel');

class ListContainers {
    constructor() {
    }

    process(request, res) {
        const prefix = request.query.prefix || '',
            maxresults = request.query.maxresults || "5000",
            includeMetadata = (request.query.include === 'metadata') ? true : false,
            marker = request.query.marker || '';
        storageManager.listContainer(prefix, maxresults)
            .then((response) => {
                response.addHttpProperty('content-type', 'application/xml');
                res.set(response.httpProps);
                let transformedModel = this._transformContainerList(response.payload, includeMetadata, prefix, maxresults, marker);
                let xmlDoc = js2xmlparser.parse('EnumerationResults', transformedModel);
                xmlDoc = xmlDoc.replace(`<EnumerationResults>`, `<EnumerationResults ServiceEndpoint="http://localhost:10000/devstoreaccount1">`);
                xmlDoc = xmlDoc.replace(`<?xml version='1.0'?>`, `<?xml version="1.0" encoding="utf-8"?>`);
                xmlDoc = xmlDoc.replace(/\>[\s]+\</g, '><');
                // Forcing Express.js to not touch the charset of the buffer in order to remove charset=utf-8 as part of the content-type
                res.status(200).send(new Buffer(xmlDoc));
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
            modelContainer.Properties['Last-Modified'] = new Date(container.meta.updated || container.meta.created).toUTCString();
            modelContainer.Properties.ETag = container.etag;
            modelContainer.Properties.LeaseStatus = (['available', 'broken', 'expired'].includes(container.leaseState)) ? 'unlocked' : 'locked';
            modelContainer.Properties.LeaseState = container.leaseState;
            if (container.leaseState === 'leased') {
                modelContainer.Properties.LeaseDuration = (container.leaseDuration === -1) ? 'infinite' : 'fixed';
            } else {
                delete modelContainer.Properties.LeaseDuration;
            }
        }
        return xmlContainerListModel;
    }
}

module.exports = new ListContainers;