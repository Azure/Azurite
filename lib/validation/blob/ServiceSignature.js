'use strict';

const AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes');

/**
 * Checks whether the operation is authorized by the service signature (if existing). 
 * 
 * @class ServiceSignature
 */
class ServiceSignature {
    constructor() {
    }

    validate({ request = undefined, moduleOptions = undefined }) {
        const sm = moduleOptions.storageManager,
            accessPolicy = moduleOptions.accessPolicy;

        if (request.auth === undefined) {
            return;
        }

        

        
    }
}

module.exports = new ServiceSignature();