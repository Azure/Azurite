'use strict';

const storageManager = require('./../StorageManager'),
    js2xmlparser = require("js2xmlparser"),
    BbPromise = require('bluebird'),

    ResponseHeader = require('./../model/ResponseHeader'),
    SignedIdentifiers = require('./../model/SignedIdentifierXmlModel');

class GetContainerAcl {
    constructor() {
    }

    process(req, res, containerName) {
        storageManager.getContainerAcl(containerName)
            .then((result) => {
                res.set(new ResponseHeader(result.props));
                let xml = js2xmlparser.parse('SignedIdentifiers', result.signedIdentifiers)
                xml = xml.replace(`<?xml version='1.0'?>`, `<?xml version="1.0" encoding="utf-8"?>`); 
                res.status(200).send(xml);
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new GetContainerAcl();