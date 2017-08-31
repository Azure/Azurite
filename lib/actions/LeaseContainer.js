'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler'),
    N = require('./../model/HttpHeaderNames'),
    LeaseActions = require('./../Constants').LeaseActions;

class LeaseContainer extends StandardHandler {
    constructor() {
    }
    processImpl(request, res) {
        storageManager.leaseContainer(request)
            .then((response) => {
                response.addHttpProperty(N.LEASE_ID, response.proxy.original.leaseId);
                const leaseTimeRemaining = Math.floor((response.proxy.original.leaseBrokenAt - request.now) / 1000);
                response.addHttpProperty(N.LEASE_TIME, (leaseTimeRemaining > 0) ? leaseTimeRemaining : 0);

                let statusCode;
                switch (request.httpProps[N.LEASE_ACTION]) {
                    case LeaseActions.ACQUIRE:
                        statusCode = 201;
                        break;
                    case LeaseActions.RENEW:
                    case LeaseActions.CHANGE:
                    case LeaseActions.RELEASE:
                        statusCode = 200;
                        break;
                    case LeaseActions.BREAK:
                        statusCode = 202;
                }
                res.set(response.httpProps);
                res.status(statusCode).send();
            });
    }
}

module.exports = new LeaseContainer();