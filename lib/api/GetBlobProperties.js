'use strict';

const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob'),
    ResponseHeader = require('./../model/ResponseHeader');

class GetBlobProperties {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName, req.headers);
        if (req.query.snapshot) {
            blob.setSnapshotDate(req.query.snapshot);
        }
        storageManager.getBlobProperties(containerName, blob)
            .then((result) => {
                const optionalProps = {
                    'Accept-Ranges': 'bytes',
                    'x-ms-server-encrypted': false
                }
                optionalProps['x-ms-lease-status'] = (['available', 'broken', 'expired'].includes(result.blob.leaseState)) ? 'unlocked' : 'locked';
                optionalProps['x-ms-lease-state'] = result.blob.leaseState;
                if (optionalProps['x-ms-lease-state'] === 'leased') {
                    optionalProps['x-ms-lease-duration'] = (result.blob.leaseDuration === -1) ? 'infinite' : 'fixed';
                } 
                res.set(new ResponseHeader(result.httpProps, result.metaProps, optionalProps));
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new GetBlobProperties();