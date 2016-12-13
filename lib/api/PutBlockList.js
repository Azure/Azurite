'use strict';

const storageManager = require('./../StorageManager'),
    BlobHttpProperties = require('./../model/BlobHttpProperties'),
    BbPromise = require('bluebird'),
    xml2jsAsync = BbPromise.promisify(require('xml2js').parseString),
    md5 = require('md5');

class PutBlockList {
    constructor() {
    }

    process(req, res, containerName, blobName, xmlDoc) {
        let httpProps;
        let metaProps;
        let md5RequestBody;
        BbPromise.try(() => {
            httpProps = this._buildHttpProps(req.headers);
            metaProps = this._buildMetaProps(req.headers);
            md5RequestBody = md5(xmlDoc);
            return this._deserializeBlockList(xmlDoc)
        })
            .then((blocklist) => {
                return storageManager.putBlockList(containerName, blobName, blocklist, httpProps, metaProps)
            })
            .then((response) => {
                response.contentMD5 = md5RequestBody;
                this._addResponseHeaders(res, response);
                res.status(201).send();
            })
            .catch((e) => {
                if (e.code === 'xml') {
                    res.status(400).send('UnsupportedXmlNode');
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

    _buildHttpProps(httpHeader) {
        return new BlobHttpProperties(
            null, // ETag will be overwritten by most recent value in DB if this is an update of an existing blob
            null,
            // x-ms-* attributes have precedence over according HTTP-Headers
            httpHeader['x-ms-blob-content-type'] || httpHeader['Content-Type'] || 'application/octet-stream',
            httpHeader['x-ms-blob-content-encoding'] || httpHeader['Content-Encoding'] || 'utf8',
            httpHeader['x-ms-blob-content-language'] || httpHeader['Content-Language'],
            httpHeader['x-ms-blob-content-md5'] || httpHeader['Content-MD5'],
            httpHeader['x-ms-blob-cache-control'] || httpHeader['Cache-Control'],
            true)
    }

    _buildMetaProps(httpHeader) {
        let metaProps = {};
        Object.keys(httpHeader).forEach((key) => {
            const value = httpHeader[key];
            if (key.indexOf('x-ms-meta-') !== -1) {
                metaProps[key] = value;
            }
        });
        return metaProps;
    }
}

module.exports = new PutBlockList();