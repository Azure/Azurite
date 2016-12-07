'use strict';

const ContainerHttpProperties = require('./ContainerHttpProperties');

class BlobHttpProperties extends ContainerHttpProperties {
    constructor(etag, 
                lastModified, 
                contentType, 
                contentEncoding,
                contentLanguage,
                contentMD5,
                cacheControl) {
        super(etag, lastModified);
        if (contentType) this['Content-Type'] = contentType; 
        if (contentEncoding) this['Content-Encoding'] = contentEncoding; 
        if (contentLanguage) this['Content-Language'] = contentLanguage; 
        if (contentMD5) this['Content-MD5'] = contentMD5; 
        if (cacheControl) this['Cache-Control'] = cacheControl; 
    }
}