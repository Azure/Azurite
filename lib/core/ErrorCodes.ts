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

export default {
    // GENERAL
    InvalidXml: new ErrorCode('Invalid XML.', 400, 'One of the XML nodes specified in the request body is not supported.'),
    InvalidXmlRequest: new ErrorCode('InvalidXmlRequest', 400, 'The request body’s XML was invalid or not correctly specified.'),
    AuthenticationFailed: new ErrorCode('AuthenticationFailed', 403, 'Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.'),
    AuthorizationPermissionMismatch: new ErrorCode('AuthorizationPermissionMismatch', 403, 'This request is not authorized to perform this operation using this permission.'),
    AuthorizationResourceTypeMismatch: new ErrorCode('AuthorizationResourceTypeMismatch', 403, 'This request is not authorized to perform this operation using this resource type.'),
    CorsForbidden: new ErrorCode('Forbidden', 403, 'CORS validation failed.'),
    MissingRequiredHeader: new ErrorCode('MissingRequiredHeader', 400, 'A required HTTP header was not specified.'),
    ResourceNotFound: new ErrorCode('ResourceNotFound', 404, 'The specified resource does not exist.'),

    // BLOB
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
    BlobAlreadyExists: new ErrorCode('BlobAlreadyExists', 409, 'The specified blob already exists.'),
    UnsupportedHeader: new ErrorCode('UnsupportedHeader', 400, 'One of the headers specified in the request is not supported.'),
    UnsupportedBlobType: new ErrorCode('UnsupportedBlobType', 400, 'The blob type is invalid for this operation.'),
    SnapshotsPresent: new ErrorCode('SnapshotsPresent', 409, 'This operation is not permitted while the blob has snapshots.'),
    LeaseNotPresentWithLeaseOperation: new ErrorCode('LeaseNotPresentWithLeaseOperation', 409, 'There is currently no lease on the blob/container.'),
    LeaseIdMismatchWithLeaseOperation: new ErrorCode('LeaseIdMismatchWithLeaseOperation', 409, 'The lease ID specified did not match the lease ID for the blob/container.'),
    LeaseAlreadyPresent: new ErrorCode('LeaseAlreadyPresent', 409, 'There is already a lease present.'),
    LeaseIsBreakingAndCannotBeChanged: new ErrorCode('LeaseIsBreakingAndCannotBeChanged', 409, 'The lease ID matched, but the lease is currently in breaking state and cannot be changed.'),
    LeaseIsBreakingAndCannotBeAcquired: new ErrorCode('LeaseIsBreakingAndCannotBeAcquired', 409, 'The lease ID matched, but the lease is currently in breaking state and cannot be acquired until it is broken.'),
    LeaseIsBrokenAndCannotBeRenewed: new ErrorCode('LeaseIsBrokenAndCannotBeRenewed', 409, 'The lease ID matched, but the lease has been broken explicitly and cannot be renewed.'),
    LeaseNotPresentWithContainerOperation: new ErrorCode('LeaseNotPresentWithContainerOperation', 412, 'There is currently no lease on the container.'),
    LeaseNotPresentWithBlobOperation: new ErrorCode('LeaseNotPresentWithBlobOperation', 412, 'There is currently no lease on the blob.'),
    LeaseIdMissing: new ErrorCode('LeaseIdMissing', 412, 'There is currently a lease on the blob/container and no lease ID was specified in the request.'),
    LeaseIdMismatchWithContainerOperation: new ErrorCode('LeaseIdMismatchWithContainerOperation', 412, 'The lease ID specified did not match the lease ID for the container.'),
    LeaseIdMismatchWithBlobOperation: new ErrorCode('LeaseIdMismatchWithBlobOperation', 412, 'The lease ID specified did not match the lease ID for the blob.'),
    ConditionNotMetWrite: new ErrorCode('ConditionNotMet', 412, 'The condition specified in the conditional header(s) was not met for a write operation.'),
    ConditionNotMetRead: new ErrorCode('ConditionNotMet', 304, 'The condition specified in the conditional header(s) was not met for a read operation.'),
    MaxBlobSizeConditionNotMet: new ErrorCode('MaxBlobSizeConditionNotMet', 412, 'The max blob size condition specified was not met.'),
    AppendPositionConditionNotMet: new ErrorCode('AppendPositionConditionNotMet', 412, 'The append position condition specified was not met.'),
    InvalidRange: new ErrorCode('InvalidRange', 416, 'The range specified is invalid for the current size of the resource.'),
    InternalError: new ErrorCode('InternalError', 500, 'The server encountered an internal error. Please retry the request.'),
    PendingCopyOperation: new ErrorCode('PendingCopyOperation', 409, 'There is currently a pending copy operation.'),
    NoPendingCopyOperation: new ErrorCode('NoPendingCopyOperation', 409, 'There is currently no pending copy operation.'),
    InvalidBlockList: new ErrorCode('InvalidBlockList', 400, 'The specified block list is invalid.'),
    InvalidResourceName: new ErrorCode('InvalidResourceName', 400, 'The specifed resource name contains invalid characters.'),

    // QUEUE
    OutOfRangeInput: new ErrorCode('OutOfRangeInput', 400, 'One of the request inputs is out of range.'),
    QueueAlreadyExists: new ErrorCode('QueueAlreadyExists', 409, 'The specified queue already exists.'),
    QueueNotFound: new ErrorCode('QueueNotFound', 404, 'The specified queue does not exist.'),
    MessageTooLarge: new ErrorCode('MessageTooLarge', 400, 'The message exceeds the maximum allowed size.'),
    MessageNotFound: new ErrorCode('MessageNotFound', 404, 'The specified message does not exist.'),
    PopReceiptMismatch: new ErrorCode('PopReceiptMismatch', 400, 'The specified pop receipt did not match the pop receipt for a dequeued message.'),

    // TABLE see: https://docs.microsoft.com/en-us/rest/api/storageservices/table-service-error-codes
    AtomXmlNotSupported: new ErrorCode('Atom+XmlNotSupported', 501, 'Atom feed is currently not supported by Azurite.'),
    // See https://docs.microsoft.com/en-us/rest/api/storageservices/understanding-the-table-service-data-model
    ReservedTableName: new ErrorCode('BadRequest', 404, 'The table name is reserved.'),
    DuplicatePropertiesSpecified: new ErrorCode('DuplicatePropertiesSpecified', 400, 'A property is specified more than one time.'),
    EntityNotFound: new ErrorCode('EntityNotFound', 404, 'The specified entity does not exist.'),
    EntityAlreadyExists: new ErrorCode('EntityAlreadyExists', 409, 'The specified entity already exists.'),
    EntityTooLarge: new ErrorCode('EntityTooLarge', 400, 'The entity is larger than the maximum size permitted.'),
    HostInformationNotPresent: new ErrorCode('HostInformationNotPresent', 400, 'The required host information is not present in the request. You must send a non-empty Host header or include the absolute URI in the request line.'),
    InvalidValueType: new ErrorCode('InvalidValueType', 400, 'The value specified is invalid.'),
    JsonFormatNotSupported: new ErrorCode('JsonFormatNotSupported', 415, 'JSON format is not supported.'),
    MethodNotAllowed: new ErrorCode('MethodNotAllowed', 405, 'The requested method is not allowed on the specified resource.'),
    NotImplemented: new ErrorCode('NotImplemented', 501, 'The requested operation is not implemented on the specified resource.'),
    PropertiesNeedValue: new ErrorCode('PropertiesNeedValue', 400, 'Values have not been specified for all properties in the entity.'),
    PropertyNameInvalid: new ErrorCode('PropertyNameInvalid', 400, 'The property name is invalid.'),
    PropertyNameTooLong: new ErrorCode('PropertyNameTooLong', 400, 'The property name exceeds the maximum allowed length.'),
    PropertyValueTooLarge: new ErrorCode('PropertyValueTooLarge', 400, 'The property value is larger than the maximum size permitted.'),
    TableAlreadyExists: new ErrorCode('TableAlreadyExists', 409, 'The table specified already exists.'),
    TableBeingDeleted: new ErrorCode('TableBeingDeleted', 409, 'The specified table is being deleted.'),
    TableNotFound: new ErrorCode('TableNotFound', 404, 'The table specified does not exist.'),
    TooManyProperties: new ErrorCode('TooManyProperties', 400, 'The entity contains more properties than allowed.'),
    UpdateConditionNotSatisfied: new ErrorCode('UpdateConditionNotSatisfied', 412, 'The update condition specified in the request was not satisfied.'),
    XMethodIncorrectCount: new ErrorCode('XMethodIncorrectCount', 400, 'More than one X-HTTP-Method is specified.'),
    XMethodIncorrectValue: new ErrorCode('XMethodIncorrectValue', 400, 'The specified X-HTTP-Method is invalid.'),
    XMethodNotUsingPost: new ErrorCode('XMethodNotUsingPost', 400, 'The request uses X-HTTP-Method with an HTTP verb other than POST.'),

}   
