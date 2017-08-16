'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler'),
    LeaseStatus = require('./../Constants').LeaseStatus,
    N = require('./../model/HttpHeaderNames'),
    js2xmlparser = require("js2xmlparser"),
    model = require('./../xml/BlobListXmlModel');

class ListBlobs extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        const queryParams = this._getParams(request.query);
        storageManager.listBlobs(request)
            .then((response) => {
                response.addHttpProperty(N.CONTENT_TYPE, 'application/xml');
                const includeMetadata = queryParams.include === 'metadata';
                const transformedModel = this._transformBlobList(response.payload, request.query, includeMetadata === true);
                let xmlDoc = js2xmlparser.parse('EnumerationResults', transformedModel);
                xmlDoc = xmlDoc.replace(`<EnumerationResults>`, `<EnumerationResults ServiceEndpoint="http://localhost:10000/devstoreaccount1" ContainerName="${request.containerName}">`);
                xmlDoc = xmlDoc.replace(/\>[\s]+\</g, '><');
                res.set(response.httpProps);
                res.status(200).send(xmlDoc);
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
            modelBlob.Properties[N.LAST_MODIFIED] = blob.httpProps[N.LAST_MODIFIED];
            modelBlob.Properties[N.ETAG] = blob.httpProps[N.ETAG];
            modelBlob.Properties[N.CONTENT_TYPE] = blob.httpProps[N.CONTENT_TYPE];
            modelBlob.Properties[N.CONTENT_ENCODING] = blob.httpProps[N.CONTENT_ENCODING];
            modelBlob.Properties[N.CONTENT_MD5] = blob.httpProps[N.CONTENT_MD5];
            modelBlob.Properties.LeaseStatus = ([LeaseStatus.AVAILABLE, LeaseStatus.BROKEN, LeaseStatus.EXPIRED].includes(blob.leaseState)) ? 'unlocked' : 'locked';
            modelBlob.Properties.LeaseState = blob.leaseState;
            if (blob.leaseState === LeaseStatus.LEASED) {
                modelBlob.Properties.LeaseDuration = (blob.leaseDuration === -1) ? 'infinite' : 'fixed';
            } else {
                delete modelBlob.Properties.LeaseDuration;
            }
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