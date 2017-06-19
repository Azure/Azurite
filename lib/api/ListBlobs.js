'use strict';

const storageManager = require('./../StorageManager'),
    js2xmlparser = require("js2xmlparser"),
    ResponseHeader = require('./../model/ResponseHeader'),
    model = require('./../model/BlobListXmlModel');

class ListBlobs {
    constructor() {
    }

    process(req, res, container) {
        const queryParams = this._getParams(req.query);
        storageManager.listBlobs(container, queryParams)
            .then((result) => {
                const includeMetadata = queryParams.include === 'metadata';
                const transformedModel = this._transformBlobList(result, req.query, includeMetadata === true);
                let xmlDoc = js2xmlparser.parse('EnumerationResults', transformedModel);
                xmlDoc = xmlDoc.replace(`<EnumerationResults>`, `<EnumerationResults ServiceEndpoint="http://localhost:10000/devstoreaccount1" ContainerName="${container}">`);
                xmlDoc = xmlDoc.replace(/\>[\s]+\</g, '><');
                res.set(new ResponseHeader({ 'Content-Type': 'application/xml' }));
                res.status(200).send(xmlDoc);
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }

    _getParams(query) {
        const queryParams = {
            prefix: query.prefix || '',
            delimiter: (query.delimiter) ? true : false,
            marker: query.marker || 0,
            maxresults: query.maxresults || 5000,
            include: query.include
        }
        return queryParams;
    }

    _transformBlobList(blobList, queryParams, includeMetadata) {
        let xmlBlobListModel = new model.BlobList();
        (queryParams.prefix === undefined) ? delete xmlBlobListModel.Prefix : xmlBlobListModel.Prefix = queryParams.prefix;
        (queryParams.maxresults === undefined) ? delete xmlBlobListModel.MaxResults : xmlBlobListModel.MaxResults = queryParams.maxresults;
        (queryParams.marker === undefined) ? delete xmlBlobListModel.Marker : xmlBlobListModel.Marker = marker;
        for (let blob of blobList) {
            let modelBlob = new model.Blob(blob.name, blob.blobType);
            xmlBlobListModel.Blobs.Blob.push(modelBlob);
            if (!includeMetadata) {
                delete modelBlob.Metadata;
            } else {
                this._addMetadata(modelBlob, blob.metaProps);
            }
            modelBlob.Properties['Last-Modified'] = blob.httpProps['Last-Modified'];
            modelBlob.Properties.ETag = blob.httpProps.ETag;
            modelBlob.Properties['Content-Type'] = blob.httpProps['Content-Type'];
            modelBlob.Properties['Content-Encoding'] = blob.httpProps['Content-Encoding'];
            modelBlob.Properties['Content-MD5'] = blob.httpProps['Content-MD5'];
        }
        return xmlBlobListModel;
    }

    _addMetadata(blobModel, metaProps) {
        Object.keys(metaProps).forEach((key) => {
            let value = metaProps[key];
            key = key.replace('x-ms-meta-', '');
            blobModel.Metadata[key] = value;
        });
    }
}

module.exports = new ListBlobs();