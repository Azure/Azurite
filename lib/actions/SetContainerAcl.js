'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler'),
    BbPromise = require('bluebird'),
    parseSignedIdentifiers = require('./../xml/Serializers').parseSignedIdentifiers,

class SetContainerAcl extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        BbPromise.resolve().then(() => {
            return parseSignedIdentifiers(request.body);
        })
            .then((signedIdentifiers) => {
                // Fixme: models such as signedIdentifiers will be available as request.model
                // This will be set in validation middleware
                return storageManager.setContainerAcl(request, signedIdentifiers);
            });
    }
}

module.exports = new SetContainerAcl();