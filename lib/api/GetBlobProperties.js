'use strict';

const storageManager = require('./../StorageManager'),
    N = require('./../model/HttpHeaderNames'),
    LeaseStatus = require('./../Constants').LeaseStatus,
    StandardHandler = require('./StandardHandler');

class GetBlobProperties extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        storageManager.getBlobProperties(request)
            .then((response) => {
                response.addHttpProperty(N.ACCEPT_RANGES, 'bytes');
                response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
                response.addHttpProperty(N.LEASE_STATUS, ([LeaseStatus.AVAILABLE, LeaseStatus.BROKEN, LeaseStatus.EXPIRED].includes(result.blob.leaseState)) ? 'unlocked' : 'locked');
                response.addHttpProperty(N.LEASE_STATE, response.proxy.original.leaseState);
                if (response.httpProps[N.LEASE_STATE] === LeaseStatus.LEASED) {
                    response.addHttpProperty(N.LEASE_DURATION, (response.blobProxy.original.leaseDuration === -1) ? 'infinite' : 'fixed');
                }
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

module.exports = new GetBlobProperties();