'use strict';

/**
 * Common and Blob Error codes as specified at 
 * https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/status-and-error-codes2
 */
class ErrorCode {
    constructor(errorCode, httpErrorCode, userMessage) {
        this.errorCode = errorCode;
        this.httpErrorCode = httpErrorCode;
        this.userMessage = userMessage;
    }
}

module.exports = {
    ContainerNotFound: new ErrorCode('ContainerNotFound', 404, 'The specified container does not exist.'),
    ContainerAlreadyExists: new ErrorCode('ContainerAlreadyExists', 409, 'The specified container already exists.'),
    InvalidHeaderValue: new ErrorCode('InvalidHeaderValue', 400, 'The value provided for one of the HTTP headers was not in the correct format.'),
    InvalidInput: new ErrorCode('InvalidInput', 400, 'One of the request inputs is not valid.'),
    InvalidPageRange: new ErrorCode('InvalidPageRange', 416, 'The page range specified is invalid.'),
    MissingContentLengthHeader: new ErrorCode('MissingContentLengthHeader', 411, 'The Content-Length header was not specified.'),
    Md5Mismatch: new ErrorCode('Md5Mismatch', 400, 'The MD5 value specified in the request did not match the MD5 value calculated by the server.'),
    PreconditionFailed: new ErrorCode('PreconditionFailed', 412, 'One of the XML nodes specified in the request body is not supported.'),
    BlockCountExceedsLimit: new ErrorCode('BlockCountExceedsLimit', 409, 'The committed block count cannot exceed the maximum limit of 50,000 blocks.'),
    InvalidBlobType: new ErrorCode('InvalidBlobType', 409, 'The blob type is invalid for this operation.'),
    RequestBodyTooLarge: new ErrorCode('RequestBodyTooLarge', 413, 'The size of the request body exceeds the maximum size permitted.'),
    BlobNotFound: new ErrorCode('BlobNotFound', 404, 'The specified blob does not exist.'),
    RequestBodyTooLarge: new ErrorCode('RequestBodyTooLarge', 413, 'The size of the request body exceeds the maximum size permitted.'),
    BlobAlreadyExists: new ErrorCode('BlobAlreadyExists', 409, 'The specified blob already exists.'),
    UnsupportedHeader: new ErrorCode('UnsupportedHeader', 400, 'One of the headers specified in the request is not supported.'),
    UnsupportedBlobType: new ErrorCode('UnsupportedBlobType', 400, 'The blob type is invalid for this operation.')
}