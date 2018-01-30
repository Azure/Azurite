'use strict';

const BbPromise = require('bluebird'),
    N = require('./../../core/HttpHeaderNames'),
    AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes'),
    Operations = require('./../../core/Constants').Operations.Table;
    

module.exports = (req, res, next) => {
    BbPromise.try(() => {
        // Azurite currently does not support XML-Atom responses, only supports JSON-based responses.
        if (req.headers[N.CONTENT_TYPE] === `application/atom+xml`) {
            throw new AError(ErrorCodes.AtomXmlNotSupported);
        }
        const validationContext = new ValidationContext({});
        validations[req.azuriteOperation](validationContext);
        next();
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const validations = {};

validations[undefined] = () => {
    // NO VALIDATIONS (this is an unimplemented call)
}

validations[Operations.CREATE_TABLE] = (valContext) => {
    // TODO: Implement validation
}