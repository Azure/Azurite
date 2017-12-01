'use strict';

const BbPromise = require('bluebird'),
    crypto = require('crypto'),
    Keys = require('./../../core/Constants').Keys,
    Operations = require('./../../core/Constants').Operations;

module.exports = (req, res, next) => {
    BbPromise.try(() => {
        const request = req.azuriteRequest;
        if (request.query.sig === undefined) {
            next();
            return;
        }

        const accessPolicy = {
            permissions: request.query.sp,
            start: request.query.st,
            expiry: request.query.se,
            canonicalizedResource: request.query.sr === 'c'
                ? `/blob/devstoreaccount1/${request.containerName}`
                : `/blob/devstoreaccount1/${request.containerName}/${request.blobName}`,
            id: request.query.si,
            ipAddressOrRange: request.query.sip,
            protocols: request.query.spr,
            version: request.query.sv,
            rscc: request.query.rscc,
            rscd: request.query.rscd,
            rsce: request.query.rsce,
            rscl: request.query.rscl,
            rsct: request.query.rsct
        };

        const sig = _generateSignature(accessPolicy);
        request.auth = {};
        request.auth.sasValid = sig === request.query.sig;
        request.auth.accessPolicy = accessPolicy;
        request.auth.resource = request.query.sr;
        next();
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

function _generateSignature(ap) {
    let str = '';
    for (const key in ap) {
        str += ap[key] === undefined ? `\n` : `${ap[key]}\n`;
    }
    str = str.slice(0, str.length - 1);
    str = decodeURIComponent(str);
    const sig = crypto.createHmac('sha256', Keys.DecodedAccessKey)
        .update(str, 'utf8')
        .digest('base64');
    return sig;
}