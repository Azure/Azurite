'use strict';

class ResponseHeader {
    constructor(systemProps, metaProps, optionalProps) {
        this['x-ms-version'] = '2013-08-18';
        this['Date'] = new Date().toGMTString();
        systemProps = systemProps || {};
        metaProps = metaProps || {};
        optionalProps = optionalProps || {};
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

module.exports = ResponseHeader;