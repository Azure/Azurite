'use strict';

const BbPromise = require('bluebird'),
    AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes'),
    N = require('./../../core/HttpHeaderNames'),
    sm = require('./../../core/blob/StorageManager');

// Performs CORS rule-validation iff CORS is enabled and request header 'origin' is set.
module.exports = (req, res, next) => {
    BbPromise.try(() => {
        const request = req.azuriteRequest;
        sm.getBlobServiceProperties(request)
            .then((response) => {
                if (response.payload.StorageServiceProperties && request.httpProps[N.ORIGIN]) {
                    for (const rule of response.payload.StorageServiceProperties.Cors) {
                        if (!rule.AllowedOrigins.includes(req.hostname)) {
                            throw new AError(ErrorCodes.CorsForbidden);
                        }

                        if (!rule.AllowedMethods.includes(req.method.toLowerCase())) {
                            throw new AError(ErrorCodes.CorsForbidden);
                        }

                        rule.AllowedHeaders.split(',')
                            .forEach((e) => {
                                let valid = false;
                                Object.keys(req.headers).forEach((requestHeader) => {
                                    if (e.charAt(e.length) === '*') {
                                        if (requestHeader.includes(e.slice(0, -1))) {
                                            valid = true;
                                        }
                                    } else {
                                        if (e === requestHeader) {
                                            valid = true;
                                        }
                                    }
                                });
                                if (!valid) {
                                    throw new AError(ErrorCodes.CorsForbidden);
                                }
                            });
                    }
                }
                next();
            });
        return;
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}