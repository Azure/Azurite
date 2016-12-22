'use strict';

const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob'),
    BbPromise = require('bluebird'),
    xml2jsAsync = BbPromise.promisify(require('xml2js').parseString),
    md5 = require('md5');

class PutBlockList {
    constructor() {
    }

    process(req, res, containerName, blobName, xmlDoc) {
        const blob = new Blob(blobName, req.headers); 
        let md5RequestBody;
        BbPromise.try(() => {
            md5RequestBody = md5(xmlDoc);
            return this._deserializeBlockList(xmlDoc)
        })
        .then((blocklist) => {
            return storageManager.putBlockList(containerName, blob, blocklist)
        })
        .then((response) => {
            response.contentMD5 = md5RequestBody;
            this._addResponseHeaders(res, response);
            res.status(201).send();
        })
        .catch((e) => {
            if (e.code === 'xml') {
                res.status(400).send('UnsupportedXmlNode');
            } else if (e.code === 'ENOENT'){
                res.status(400).send('InvalidBlockList');
            } else {
                res.status(500).send();
                throw e;
            }
        });
    }

    _deserializeBlockList(xmlDoc) {
        const txt = xmlDoc.toString('utf8');
        return xml2jsAsync(xmlDoc.toString('utf8'))
            .then((result) => {
                let blockIds = [];
                Object.keys(result.blocklist).forEach((type) => {
                    result.blocklist[type].forEach((id) => {
                        blockIds.push({
                            type: type,
                            id: id
                        });
                    });
                });
                return blockIds;
            })
            .catch((err) => {
                const e = new Error('Invalid XML.');
                e.code = 'xml';
                throw e;
            });
    }

    _addResponseHeaders(res, props) {
        res.set({
            'ETag': props.ETag,
            'Last-Modified': props.lastModified,
            'Content-MD5': props.contentMD5,
            'x-ms-request-server-encrypted': false,
            'x-ms-version': '2011-08-18',
        });
    }
}

module.exports = new PutBlockList();