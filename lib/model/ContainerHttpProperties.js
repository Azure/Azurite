class ContainerHttpProperties {
    constructor(etag, lastModified, xmsmeta) {
        // Standard HTTP-Properties
        // See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/setting-and-retrieving-properties-and-metadata-for-blob-resources
        this.ETag = etag || 1;
        this.LastModified = lastModified || new Date().toGMTString();
        // Non-standard HTTP-Properties in the following format: x-ms-meta-Name:string-value
    }
}

module.exports = ContainerHttpProperties;