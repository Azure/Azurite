'use strict';

const crypto = require('crypto'),
    AError = require('./../Error');

class MD5 {
    constructor() {
    }

    /**
     * @param {Object} options - validation input
     * @param {Object} options.collection - Reference to in-memory database
     * @param {Object} options.body - The body of the request (optional)
     * @param {String} options.containerName - The name of the container involved (optional)
     * @param {Object} options.requestBlob - The name of the request blob (optional)
     * @param {Object} options.updateBlob - The name of the to be updated blob (already exists in DB) (optional)
     */
    validate(options) {
        const sourceMD5 = options.requestBlob.httpProps['Content-MD5'];
        const targetMD5 = crypto.createHash('md5')
            .update(options.body)
            .digest('base64');
        if (sourceMD5 && targetMD5 !== sourceMD5) {
            throw new AError('Md5Mismatch', 400, 'The MD5 value specified in the request did not match the MD5 value calculated by the server.');
        }
        return options;
    }
}

module.exports = new MD5();