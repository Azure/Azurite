'use strict';

const storageManager = require('./../StorageManager'),
    BbPromise = require('bluebird'),
    xml2js = require('xml2js'),
    ResponseHeader = require('./../model/ResponseHeader'),
    SignedIdentifiers = require('./../model/SignedIdentifierXmlModel'),
    Container = require('./../model/Container');

const parseStringAsync = BbPromise.promisify(new xml2js.Parser({ explicitArray: false }).parseString);

class SetContainerAcl {
    constructor() {
    }

    process(req, res, containerName, body) {
        BbPromise.resolve().then(() => {
            return this._parseSignedIdentifiers(body);
        })
            .then((signedIdentifiers) => {
                const container = new Container(containerName, req.headers);
                return storageManager.setContainerAcl(container, signedIdentifiers);
            })
            .then((result) => {
                res.set(new ResponseHeader(result));
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }

    _parseSignedIdentifiers(body) {
        body = body.toString('utf8');
        return parseStringAsync(body)
            .then((temp) => {
                if (temp === null) {
                    return null;
                }
                const model = new SignedIdentifiers();
                for (const si of temp.SignedIdentifiers.SignedIdentifier) {
                    model.addSignedIdentifier(si.Id, si.AccessPolicy.Start, si.AccessPolicy.Expiry, si.AccessPolicy.Permission);
                }
                return model;
            });
    }
}

module.exports = new SetContainerAcl();