'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler'),
    N = require('./../model/HttpHeaderNames'),
    Blob = require('./../model/Blob'),
    BbPromise = require('bluebird'),
    BlobTypes = require('./../Constants').BlobTypes,
    ResponseHeader = require('./../model/ResponseHeader'),
    xml2jsAsync = BbPromise.promisify(require('xml2js').parseString),
    AError = require('./../AzuriteError'),
    crypto = require('crypto');

class PutBlockList extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        return this._deserializeBlockList(request.body)
            .then((blocklist) => {
                return storageManager.putBlockList(request, blocklist)
            })
            .then((response) => {
                response.addHttpProperty(N.CONTENT_MD5, request.calculateContentMd5());
                response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
                res.set(response.httpProps);
                res.status(201).send();
            });
    }

    _deserializeBlockList(xmlDoc) {
        const txt = xmlDoc.toString('utf8');
        return xml2jsAsync(txt)
            .then((result) => {
                let blockIds = [];
                Object.keys(result.BlockList).forEach((type) => {
                    result.BlockList[type].forEach((id) => {
                        blockIds.push({
                            type: type,
                            id: id
                        });
                    });
                });
                return blockIds;
            })
            .catch((err) => {
                throw new AError('Invalid XML.', 400, 'One of the XML nodes specified in the request body is not supported.');
            });
    }
}

module.exports = new PutBlockList();