'use strict';

const uuidV1 = require('uuid/v1');

class AzuriteResponse {
    constructor(systemProps, optionalProps, metaProps) {
        this['x-ms-version'] = '2016-05-31';
        this['Date'] = new Date().toGMTString();
        this['Content-Length'] = 0;
        this['x-ms-request-id'] = uuidV1();
        systemProps = systemProps || {};
        optionalProps = optionalProps || {};
        metaProps = metaProps || {};
        Object.keys(systemProps).forEach(key => {
            this[key] = systemProps[key];
        });
        Object.keys(optionalProps).forEach(key => {
            this[key] = optionalProps[key];
        });
        Object.keys(metaProps).forEach((key) => {
            this[`x-ms-meta-${key}`] = metaProps[key]; 
        });
    }
}

module.exports = AzuriteResponse;