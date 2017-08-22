'use strict';

const storageManager = require('./../StorageManager'),
    BbPromise = require('bluebird'),
    parseSignedIdentifiers = require('./../xml/Serializers').parseSignedIdentifiers,

class SetContainerAcl {
    constructor() {
    }

    process(request, res) {
        BbPromise.resolve().then(() => {
            return parseSignedIdentifiers(request.body.toString('utf8'));
        })
            .then((signedIdentifiers) => {
                // Fixme: models such as signedIdentifiers will be available as request.model
                // This will be set in validation middleware
                return storageManager.setContainerAcl(request, signedIdentifiers);
            })
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

module.exports = new SetContainerAcl();