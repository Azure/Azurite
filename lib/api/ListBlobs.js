'use strict';

const storageManager = require('./../StorageManager'),
    js2xmlparser = require("js2xmlparser"),
    model = require('./../model/BlobListXmlModel');

class ListBlobs {
    constructor() {
    }

    process(req, res, container) {
        const queryParams = this._getParams(req.query);
        storageManager.listBlobs(container, queryParams)
            .then((result) => {
                const includeMetadata = queryParams.include && queryParams.include.indexOf('metadata') !== -1;
                const transformedModel = this._transformBlobList(result, req.query, includeMetadata === true);
                const xmlDoc = js2xmlparser.parse('EnumerationResults', transformedModel);
                res.status(200).send(xmlDoc);
            })
            .catch((e) => {
                if (e.code === 'ContainerNotFound') {
                    res.status(404).send('ContainerNotFound');
                    return;
                }
                res.status(500).send();
                throw e;
            });
    }

    _getParams(query) {
        const queryParams = {
            prefix: query.prefix || '',
            delimiter: (query.delimiter) ? true : false,
            marker: query.marker || 0,
            maxresults: query.maxresults || 5000,
            include: query['include=']
        }
        if (queryParams.include) {
            queryParams.include = queryParams.include.split('%82');
        }
        return queryParams;
    }

    _transformBlobList(blobList, queryParams, includeMetadata) {
        let xmlBlobListModel = new model.BlobList();
        (queryParams.prefix === undefined) ? delete xmlBlobListModel.prefix : xmlBlobListModel.prefix = queryParams.prefix;
        (queryParams.maxresults === undefined) ? delete xmlBlobListModel.maxResults : xmlBlobListModel.maxResults = queryParams.maxresults;
        (queryParams.marker === undefined) ? delete xmlBlobListModel.marker : xmlBlobListModel.marker = marker;
        for(let blob of blobList) {
            let modelBlob = new model.Blob(blob.name);
            xmlBlobListModel.blobs.blob.push(modelBlob);
            if (!includeMetadata) {
                delete modelBlob.metadata;
            } else {
                this._addMetadata(modelBlob, blob.meta_props);
            }
            modelBlob.properties['Last-Modified'] = blob.http_props.lastModified;
            modelBlob.properties.ETag = blob.http_props.ETag;
            modelBlob.properties['Content-Type'] = blob.http_props['Content-Type'];
            modelBlob.properties['Content-Encoding'] = blob.http_props['Content-Encoding'];
            modelBlob.properties['Content-MD5'] = blob.http_props.ContentMD5;
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