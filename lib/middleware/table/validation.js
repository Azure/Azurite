'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../../core/Constants').Operations;

module.exports = (req, res, next) => {
    BbPromise.try(() => {
        const validationContext = new ValidationContext({})
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