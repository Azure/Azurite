'use strict';

const ContainerHttpProperties = require('./ContainerHttpProperties');

class BlobHttpProperties extends ContainerHttpProperties {
    constructor(etag, 
                lastModified, 
                contentType, 
                contentEncoding,
                contentLanguage,
                contentMD5,
                cacheControl,
                committed) {
        super(etag, lastModified);
        if (contentType) this['Content-Type'] = contentType; 
        if (contentEncoding) this['Content-Encoding'] = contentEncoding; 
        if (contentLanguage) this['Content-Language'] = contentLanguage; 
        if (contentMD5) this['Content-MD5'] = contentMD5; 
        if (cacheControl) this['Cache-Control'] = cacheControl; 
        // Internal flag to determine whether a blob has been committed.
        // This is only needed for "PUT Block" and "PUT Block List" operations.
        // In case of "PUT Blob" operations it is set to true per default. 
        this.committed = (committed) ? committed : false;
    }
}

module.exports = BlobHttpProperties;