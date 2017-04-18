'use strict';

const storageManager = require('./../StorageManager'),
    xml2js = require('xml2js'),
    Container = require('./../model/Container');

const parseString = new xml2js.Parser({ explicitArray: false }).parseString;

class SetContainerAcl {
    constructor() {
    }

    process(req, res, containerName, body) {
        BbPromise.resolve().then(() => {
            const container = new Container(containerName, req.headers);
            const signedIdentifiers = this._parseSignedIdentifiers(body);
            return storageManager.setContainerAcl(container, signedIdentifiers);
        })
            .then((result) => {
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }

    _parseSignedIdentifiers(body) {
        const temp = parseString(body);
        if (temp === null) {
            return null;
        }

        
    }
}

module.exports = new SetContainerAcl();