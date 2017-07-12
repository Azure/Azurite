'use strict';

const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob'),
    BbPromise = require('bluebird'),
    BlobTypes = require('./../Constants').BlobTypes,
    ResponseHeader = require('./../model/ResponseHeader'),
    xml2jsAsync = BbPromise.promisify(require('xml2js').parseString),
    AError = require('./../Error'),
    crypto = require('crypto');

class PutBlockList {
    constructor() {
    }

    process(req, res, containerName, blobName, xmlDoc) {
        const blob = new Blob(blobName, req.headers, BlobTypes.BlockBlob, req.rawHeaders);
        let md5RequestBody;
        BbPromise.try(() => {
            const md5RequestBody = crypto.createHash('md5')
                .update(xmlDoc)
                .digest('base64');
            return this._deserializeBlockList(xmlDoc)
        })
            .then((blocklist) => {
                return storageManager.putBlockList(containerName, blob, blocklist)
            })
            .then((response) => {
                response['Content-MD5'] = md5RequestBody;
                res.set(new ResponseHeader(response, null, { 'x-ms-request-server-encrypted': false }));
                res.status(201).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }

    _deserializeBlockList(xmlDoc) {
        const txt = xmlDoc.toString('utf8');
        return xml2jsAsync(xmlDoc.toString('utf8'))
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