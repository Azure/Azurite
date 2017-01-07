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
                const xmlDoc = js2xmlparser.parse('EnumerationResults', transformedModel);
                res.set(new ResponseHeader());
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
        (queryParams.prefix === undefined) ? delete xmlBlobListModel.prefix : xmlBlobListModel.prefix = queryParams.prefix;
        (queryParams.maxresults === undefined) ? delete xmlBlobListModel.maxResults : xmlBlobListModel.maxResults = queryParams.maxresults;
        (queryParams.marker === undefined) ? delete xmlBlobListModel.marker : xmlBlobListModel.marker = marker;
        for (let blob of blobList) {
            let modelBlob = new model.Blob(blob.name);
            xmlBlobListModel.blobs.blob.push(modelBlob);
            if (!includeMetadata) {
                delete modelBlob.metadata;
            } else {
                this._addMetadata(modelBlob, blob.metaProps);
            }
            modelBlob.properties['Last-Modified'] = blob.httpProps['Last-Modified'];
            modelBlob.properties.ETag = blob.httpProps.ETag;
            modelBlob.properties['Content-Type'] = blob.httpProps['Content-Type'];
            modelBlob.properties['Content-Encoding'] = blob.httpProps['Content-Encoding'];
            modelBlob.properties['Content-MD5'] = blob.httpProps['Content-MD5'];
        }
        return xmlBlobListModel;
    }

    _addMetadata(blobModel, metaProps) {
        Object.keys(metaProps).forEach((key) => {
            let value = metaProps[key];
            key = key.replace('x-ms-meta-', '');
            key = 'metadata-' + key;
            blobModel.metadata[key] = value;
        });
    }
}

module.exports = new ListBlobs();