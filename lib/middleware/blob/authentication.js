'use strict';

import BbPromise from 'bluebird';
import crypto from 'crypto';
import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';
import env from './../../core/env';
import { Keys } from './../../core/Constants';
import { Operations } from './../../core/Constants';

export default (req, res, next) => {
    BbPromise.try(() => {
        const request = req.azuriteRequest;
        if (env.accountAuth) {
            if (req.headers.authorization === undefined) throw new AError(ErrorCodes.AuthenticationFailed);
            const match = /SharedKey devstoreaccount1:(.*)/.exec(req.headers.authorization);
            if (match === null) throw new AError(ErrorCodes.AuthenticationFailed);
            const sig = _generateAccountSignature(req);
            if (sig.toString() != match[1].toString()){
                console.log("ERROR : Signature did not match!");
                throw new AError(ErrorCodes.AuthenticationFailed);
            }

        }

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
};

function _generateAccountSignature(req) {
    let str = `${req.method.toUpperCase()}\n`
    str += req.headers['content-encoding'] === undefined  ? `\n` : `${req.headers['content-encoding']}\n`
    str += req.headers['content-language'] === undefined  ? `\n` : `${req.headers['content-language']}\n`
    str += req.headers['content-length'] === undefined || req.headers['content-length'] === '0' ? `\n` : `${req.headers['content-length']}\n`
    str += req.headers['content-md5'] === undefined  ? `\n` : `${req.headers['content-md5']}\n`
    str += req.headers['content-type'] === undefined  ? `\n` : `${req.headers['content-type']}\n`
    str += req.headers['date'] === undefined  ? `\n` : `${req.headers['date']}\n`
    str += req.headers['if-modified-since'] === undefined  ? `\n` : `${req.headers['if-modified-since']}\n`
    str += req.headers['if-match'] === undefined  ? `\n` : `${req.headers['if-match']}\n`
    str += req.headers['if-none-match'] === undefined  ? `\n` : `${req.headers['if-none-match']}\n`
    str += req.headers['if-unmodified-since'] === undefined  ? `\n` : `${req.headers['if-unmodified-since']}\n`
    str += req.headers['range'] === undefined  ? `\n` : `${req.headers['range']}\n`

    // copy all x-ms-XXX headers
    var xms = {}
    for (const key in req.headers) {
        if (key.startsWith('x-ms-')) xms[key] = req.headers[key]
    }
    Object.keys(xms)
        .sort()
        .forEach(function(v, i) {
            str += `${v}:${xms[v]}\n`
        })
    str += `/devstoreaccount1${req._parsedUrl['pathname']}\n`

    Object.keys(req.query)
        .sort()
        .forEach(function(v, i) {
            var qlist = req.query[v]
            if (Array.isArray(req.query[v]))
                qlist = req.query[v].sort()
            str += `${v}:${qlist}\n`
        })

    str = str.slice(0, str.length - 1);
    str = decodeURIComponent(str);
    //console.log(str)
    const sig = crypto.createHmac('sha256', Keys.DecodedAccessKey)
        .update(str, 'utf8')
        .digest('base64');
    return sig
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