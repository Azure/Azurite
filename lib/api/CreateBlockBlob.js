'use strict';

const storageManager = require('./../StorageManager'),
      BlobHttpProperties = require('./../model/BlobHttpProperties');

class CreateBlockBlob {
    constructor() {
    }

    process(req, res, container, blob) {
        const httpProps = this._buildHttpProps(req.headers);
        const metaProps = this._buildMetaProps(req.headers);
        storageManager.createBlockBlob(container, blob, req.body, httpProps, metaProps)
            .then((result) => {
                this._addResponseHeaders(res, result)
                res.status(201).send();
            })
            .catch((e) => {
                if (e.code === 'ENOENT') {
                    console.error(`Container ${container} does not exist.`);
                    res.status(404).send();
                } else if (e.code === 'EACCES') {
                    console.error(`Azurite failed to create blob in local file system due to missing permissions.`);
                    res.status(404).send();
                } else if (e.name === 'md5') {
                    console.error(e.message);
                    res.status(400).send(e.message);
                } else {
                    res.status(500).send();
                    throw e;
                }
            })
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
            httpHeader['x-ms-blob-cache-control'] || httpHeader['Cache-Control']);
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

    _addResponseHeaders(res, props) {
        res.set({
            'ETag': props.ETag,
            'Last-Modified': props.lastModified,
            'x-ms-version': '2011-08-18',
            'x-ms-request-server-encrypted': false,
            'Content-MD5': props.md5
        });  
    }
}

module.exports = new CreateBlockBlob();