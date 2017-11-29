'use strict';

const BbPromise = require('bluebird'),
    azure = require('azure-storage'),
    Querystring = require('querystring'),
    Operations = require('./../../core/Constants').Operations;

const _blobService = azure.createBlobService("UseDevelopmentStorage=true;");

module.exports = (req, res, next) => {
    BbPromise.try(() => {
        const request = req.azuriteRequest;
        if (request.query.sig) {
            const sharedAccessPolicy = {
                AccessPolicy: {
                    Permissions: request.query.sp,
                    Start: request.query.st,
                    Expiry: request.query.se,
                    IPAddressOrRange: request.query.sip,
                    Protocols: request.query.spr,
                    Services: request.query.ss,
                    ResourceTypes: request.query.sr,
                    Version: request.query.sv,
                    Id: request.query.si
                }
            };
            request.auth = {};
            request.auth.sasValid = checkServiceSignature(request.query, request.containerName, request.blobName, sharedAccessPolicy);
            request.auth.accessPolicy = sharedAccessPolicy.AccessPolicy;
        }
        next();
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

function checkServiceSignature(query, containerName, blobName, sharedAccessPolicy) {
    const sas = _blobService.generateSharedAccessSignature(containerName, blobName, sharedAccessPolicy),
        signature = Querystring.parse(sas).sig;
    return signature === query.sig;
}