import {
  computeHMACSHA256,
  truncatedISO8061Date
} from "../../common/utils/utils";
import { BlobSASResourceType } from "./BlobSASResourceType";
import { SASProtocol } from "../../common/authentication/IAccountSASSignatureValues";
import { IIPRange, ipRangeToString } from "../../common/authentication/IIPRange";

/**
 * IBlobSASSignatureValues is used to help generating Blob service SAS tokens for containers or blobs.
 *
 * @export
 * @class IBlobSASSignatureValues
 */
export interface IBlobSASSignatureValues {
  /**
   * The version of the service this SAS will target. If not specified, it will default to the version targeted by the
   * library.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  version: string;

  /**
   * Optional. SAS protocols, HTTPS only or HTTPSandHTTP
   *
   * @type {SASProtocol | string}
   * @memberof IBlobSASSignatureValues
   */
  protocol?: SASProtocol | string;

  /**
   * Optional. When the SAS will take effect.
   *
   * @type {Date | string}
   * @memberof IBlobSASSignatureValues
   */
  startTime?: Date | string;

  /**
   * Optional only when identifier is provided. The time after which the SAS will no longer work.
   *
   * @type {Date | string}
   * @memberof IBlobSASSignatureValues
   */
  expiryTime?: Date | string;

  /**
   * Optional only when identifier is provided.
   * Please refer to either {@link ContainerSASPermissions} or {@link BlobSASPermissions} depending on the resource
   * being accessed for help constructing the permissions string.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  permissions?: string;

  /**
   * Optional. IP ranges allowed in this SAS.
   *
   * @type {IIPRange | string}
   * @memberof IBlobSASSignatureValues
   */
  ipRange?: IIPRange | string;

  /**
   * The name of the container the SAS user may access.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  containerName: string;

  /**
   * Optional. The name of the container the SAS user may access.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  blobName?: string;

  /**
   * Optional. The name of the access policy on the container this SAS references if any.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/establishing-a-stored-access-policy
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  identifier?: string;

  /**
   * Optional.  Encryption scope to use when sending requests authorized with this SAS URI.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  encryptionScope?: string;

  /**
   * Optional. The cache-control header for the SAS.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  cacheControl?: string;

  /**
   * Optional. The content-disposition header for the SAS.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  contentDisposition?: string;

  /**
   * Optional. The content-encoding header for the SAS.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  contentEncoding?: string;

  /**
   * Optional. The content-language header for the SAS.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  contentLanguage?: string;

  /**
   * Optional. The content-type header for the SAS.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  contentType?: string;

  /**
   * Optional. Specifies the accessible resources. Required for version 2018-11-09 and later.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  signedResource?: string;

  /**
   * Optional. Specifies the snapshot time. Required for version 2018-11-09 and later.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  snapshot?: string;

  /**
   * Optional. Specifies the Azure Active Directory object ID in GUID format.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  signedObjectId?: string;

  /**
   * Optional. Specifies the Azure Active Directory object ID in GUID format.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  signedTenantId?: string;

  /**
   * Optional. Abbreviation of the Azure Storage service that accepts the key..
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  signedService?: string;

  /**
   * Optional. Specifies the service version to create the key.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  signedVersion?: string;

  /**
   * Optional. Specifies date-time when the key is active.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  signedStartsOn?: string;

  /**
   * Optional. Specifies date-time when the key expires.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  signedExpiresOn?: string;

  /**
   * Optional. Beginning in version 2025-07-05, this value  specifies the Entra ID of the user would is authorized to
   * use the resulting SAS URL.  The resulting SAS URL must be used in conjunction with an Entra ID token that has been
   * issued to the user specified in this value.
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  delegatedUserObjectId?: string;

  /**
   * Optional. 
   *
   * @type {string}
   * @memberof IBlobSASSignatureValues
   */
  delegatedUserTenantId?: string;
}

/**
 * Creates an instance of SASQueryParameters.
 *
 * Only accepts required settings needed to create a SAS. For optional settings please
 * set corresponding properties directly, such as permissions, startTime and identifier.
 *
 * WARNING: When identifier is not provided, permissions and expiryTime are required.
 * You MUST assign value to identifier or expiryTime & permissions manually if you initial with
 * this constructor.
 *
 * @export
 * @param {IBlobSASSignatureValues} blobSASSignatureValues
 * @param {BlobSASResourceType} resource
 * @param {string} accountName
 * @param {Buffer} sharedKey
 * @returns {[string, string]} signature and stringToSign
 */
export function generateBlobSASSignature(
  blobSASSignatureValues: IBlobSASSignatureValues,
  resource: BlobSASResourceType,
  accountName: string,
  sharedKey: Buffer
): [string, string] {
  if (blobSASSignatureValues.version >= "2020-12-06") {
    return generateBlobSASSignature20201206(
      blobSASSignatureValues,
      resource,
      accountName,
      sharedKey
    );
  }
  else if (blobSASSignatureValues.version >= "2018-11-09") {
    return generateBlobSASSignature20181109(
      blobSASSignatureValues,
      resource,
      accountName,
      sharedKey
    );
  } else {
    return generateBlobSASSignature20150405(
      blobSASSignatureValues,
      resource,
      accountName,
      sharedKey
    );
  }
}

/**
 * Creates an instance of SASQueryParameters.
 *
 * Only accepts required settings needed to create a SAS. For optional settings please
 * set corresponding properties directly, such as permissions, startTime and identifier.
 *
 * WARNING: When identifier is not provided, permissions and expiryTime are required.
 * You MUST assign value to identifier or expiryTime & permissions manually if you initial with
 * this constructor.
 *
 * @export
 * @param {IBlobSASSignatureValues} blobSASSignatureValues
 * @param {BlobSASResourceType} resource
 * @param {string} accountName
 * @param {Buffer} udkValue
 * @returns {[string, string]} signature and stringToSign
 */
export function generateBlobSASSignatureWithUDK(
  blobSASSignatureValues: IBlobSASSignatureValues,
  resource: BlobSASResourceType,
  accountName: string,
  udkValue: Buffer
): [string, string] {
  if (blobSASSignatureValues.version >= "2025-07-05") {
    return generateBlobSASBlobSASSignatureWithUDK20250705(
      blobSASSignatureValues,
      resource,
      accountName,
      udkValue
    );
  }
  else if (blobSASSignatureValues.version >= "2020-12-06") {
    return generateBlobSASBlobSASSignatureWithUDK20201206(
      blobSASSignatureValues,
      resource,
      accountName,
      udkValue
    );
  }
  else if (blobSASSignatureValues.version >= "2020-02-10") {
    return generateBlobSASSignatureWithUDK20200210(
      blobSASSignatureValues,
      resource,
      accountName,
      udkValue
    );
  }
  else if (blobSASSignatureValues.version >= "2018-11-09") {
    return generateBlobSASSignatureUDK20181109(
      blobSASSignatureValues,
      resource,
      accountName,
      udkValue
    );
  }
  else {
    throw new RangeError("SAS token version is not valid");
  }
}

function generateBlobSASSignature20201206(
  blobSASSignatureValues: IBlobSASSignatureValues,
  resource: BlobSASResourceType,
  accountName: string,
  sharedKey: Buffer
): [string, string] {
  if (
    !blobSASSignatureValues.identifier &&
    (!blobSASSignatureValues.permissions && !blobSASSignatureValues.expiryTime)
  ) {
    throw new RangeError(
      // tslint:disable-next-line:max-line-length
      "generateBlobSASSignature(): Must provide 'permissions' and 'expiryTime' for Blob SAS generation when 'identifier' is not provided."
    );
  }

  const version = blobSASSignatureValues.version;
  const verifiedPermissions = blobSASSignatureValues.permissions;

  // Signature is generated on the un-url-encoded values.
  // TODO: Check whether validating the snapshot is necessary.
  const stringToSign = [
    verifiedPermissions ? verifiedPermissions : "",
    blobSASSignatureValues.startTime === undefined
      ? ""
      : typeof blobSASSignatureValues.startTime === "string"
        ? blobSASSignatureValues.startTime
        : truncatedISO8061Date(blobSASSignatureValues.startTime, false),
    blobSASSignatureValues.expiryTime === undefined
      ? ""
      : typeof blobSASSignatureValues.expiryTime === "string"
        ? blobSASSignatureValues.expiryTime
        : truncatedISO8061Date(blobSASSignatureValues.expiryTime, false),
    getCanonicalName(
      accountName,
      blobSASSignatureValues.containerName,
      resource === BlobSASResourceType.Blob ||
        resource === BlobSASResourceType.BlobSnapshot
        ? blobSASSignatureValues.blobName
        : ""
    ),
    blobSASSignatureValues.identifier, // TODO: ? blobSASSignatureValues.identifier : "",
    blobSASSignatureValues.ipRange
      ? typeof blobSASSignatureValues.ipRange === "string"
        ? blobSASSignatureValues.ipRange
        : ipRangeToString(blobSASSignatureValues.ipRange)
      : "",
    blobSASSignatureValues.protocol ? blobSASSignatureValues.protocol : "",
    version,
    blobSASSignatureValues.signedResource,
    blobSASSignatureValues.snapshot,
    blobSASSignatureValues.encryptionScope
      ? blobSASSignatureValues.encryptionScope
      : "",
    blobSASSignatureValues.cacheControl
      ? blobSASSignatureValues.cacheControl
      : "",
    blobSASSignatureValues.contentDisposition
      ? blobSASSignatureValues.contentDisposition
      : "",
    blobSASSignatureValues.contentEncoding
      ? blobSASSignatureValues.contentEncoding
      : "",
    blobSASSignatureValues.contentLanguage
      ? blobSASSignatureValues.contentLanguage
      : "",
    blobSASSignatureValues.contentType ? blobSASSignatureValues.contentType : ""
  ].join("\n");

  const signature = computeHMACSHA256(stringToSign, sharedKey);
  return [signature, stringToSign];
}

function generateBlobSASSignature20181109(
  blobSASSignatureValues: IBlobSASSignatureValues,
  resource: BlobSASResourceType,
  accountName: string,
  sharedKey: Buffer
): [string, string] {
  if (
    !blobSASSignatureValues.identifier &&
    (!blobSASSignatureValues.permissions && !blobSASSignatureValues.expiryTime)
  ) {
    throw new RangeError(
      // tslint:disable-next-line:max-line-length
      "generateBlobSASSignature(): Must provide 'permissions' and 'expiryTime' for Blob SAS generation when 'identifier' is not provided."
    );
  }

  const version = blobSASSignatureValues.version;
  const verifiedPermissions = blobSASSignatureValues.permissions;

  // Signature is generated on the un-url-encoded values.
  // TODO: Check whether validating the snapshot is necessary.
  const stringToSign = [
    verifiedPermissions ? verifiedPermissions : "",
    blobSASSignatureValues.startTime === undefined
      ? ""
      : typeof blobSASSignatureValues.startTime === "string"
        ? blobSASSignatureValues.startTime
        : truncatedISO8061Date(blobSASSignatureValues.startTime, false),
    blobSASSignatureValues.expiryTime === undefined
      ? ""
      : typeof blobSASSignatureValues.expiryTime === "string"
        ? blobSASSignatureValues.expiryTime
        : truncatedISO8061Date(blobSASSignatureValues.expiryTime, false),
    getCanonicalName(
      accountName,
      blobSASSignatureValues.containerName,
      resource === BlobSASResourceType.Blob ||
        resource === BlobSASResourceType.BlobSnapshot
        ? blobSASSignatureValues.blobName
        : ""
    ),
    blobSASSignatureValues.identifier, // TODO: ? blobSASSignatureValues.identifier : "",
    blobSASSignatureValues.ipRange
      ? typeof blobSASSignatureValues.ipRange === "string"
        ? blobSASSignatureValues.ipRange
        : ipRangeToString(blobSASSignatureValues.ipRange)
      : "",
    blobSASSignatureValues.protocol ? blobSASSignatureValues.protocol : "",
    version,
    blobSASSignatureValues.signedResource,
    blobSASSignatureValues.snapshot,
    blobSASSignatureValues.cacheControl
      ? blobSASSignatureValues.cacheControl
      : "",
    blobSASSignatureValues.contentDisposition
      ? blobSASSignatureValues.contentDisposition
      : "",
    blobSASSignatureValues.contentEncoding
      ? blobSASSignatureValues.contentEncoding
      : "",
    blobSASSignatureValues.contentLanguage
      ? blobSASSignatureValues.contentLanguage
      : "",
    blobSASSignatureValues.contentType ? blobSASSignatureValues.contentType : ""
  ].join("\n");

  const signature = computeHMACSHA256(stringToSign, sharedKey);
  return [signature, stringToSign];
}

function generateBlobSASSignature20150405(
  blobSASSignatureValues: IBlobSASSignatureValues,
  resource: BlobSASResourceType,
  accountName: string,
  sharedKey: Buffer
): [string, string] {
  if (
    !blobSASSignatureValues.identifier &&
    (!blobSASSignatureValues.permissions && !blobSASSignatureValues.expiryTime)
  ) {
    throw new RangeError(
      // tslint:disable-next-line:max-line-length
      "generateBlobSASSignature(): Must provide 'permissions' and 'expiryTime' for Blob SAS generation when 'identifier' is not provided."
    );
  }

  const version = blobSASSignatureValues.version;
  const verifiedPermissions = blobSASSignatureValues.permissions;

  // Signature is generated on the un-url-encoded values.
  const stringToSign = [
    verifiedPermissions ? verifiedPermissions : "",
    blobSASSignatureValues.startTime === undefined
      ? ""
      : typeof blobSASSignatureValues.startTime === "string"
        ? blobSASSignatureValues.startTime
        : truncatedISO8061Date(blobSASSignatureValues.startTime, false),
    blobSASSignatureValues.expiryTime === undefined
      ? ""
      : typeof blobSASSignatureValues.expiryTime === "string"
        ? blobSASSignatureValues.expiryTime
        : truncatedISO8061Date(blobSASSignatureValues.expiryTime, false),
    getCanonicalName(
      accountName,
      blobSASSignatureValues.containerName,
      resource === BlobSASResourceType.Blob
        ? blobSASSignatureValues.blobName
        : ""
    ),
    blobSASSignatureValues.identifier, // TODO: ? blobSASSignatureValues.identifier : "",
    blobSASSignatureValues.ipRange
      ? typeof blobSASSignatureValues.ipRange === "string"
        ? blobSASSignatureValues.ipRange
        : ipRangeToString(blobSASSignatureValues.ipRange)
      : "",
    blobSASSignatureValues.protocol ? blobSASSignatureValues.protocol : "",
    version,
    blobSASSignatureValues.cacheControl
      ? blobSASSignatureValues.cacheControl
      : "",
    blobSASSignatureValues.contentDisposition
      ? blobSASSignatureValues.contentDisposition
      : "",
    blobSASSignatureValues.contentEncoding
      ? blobSASSignatureValues.contentEncoding
      : "",
    blobSASSignatureValues.contentLanguage
      ? blobSASSignatureValues.contentLanguage
      : "",
    blobSASSignatureValues.contentType ? blobSASSignatureValues.contentType : ""
  ].join("\n");

  const signature = computeHMACSHA256(stringToSign, sharedKey);
  return [signature, stringToSign];
}

function generateBlobSASSignatureUDK20181109(
  blobSASSignatureValues: IBlobSASSignatureValues,
  resource: BlobSASResourceType,
  accountName: string,
  userDelegationKeyValue: Buffer
): [string, string] {
  if (
    !blobSASSignatureValues.identifier &&
    (!blobSASSignatureValues.permissions && !blobSASSignatureValues.expiryTime)
  ) {
    throw new RangeError(
      // tslint:disable-next-line:max-line-length
      "generateBlobSASSignature(): Must provide 'permissions' and 'expiryTime' for Blob SAS generation when 'identifier' is not provided."
    );
  }

  const verifiedPermissions = blobSASSignatureValues.permissions;

  // Signature is generated on the un-url-encoded values.
  const stringToSign = [
    verifiedPermissions ? verifiedPermissions : "",
    blobSASSignatureValues.startTime === undefined
      ? ""
      : typeof blobSASSignatureValues.startTime === "string"
        ? blobSASSignatureValues.startTime
        : truncatedISO8061Date(blobSASSignatureValues.startTime, false),
    blobSASSignatureValues.expiryTime === undefined
      ? ""
      : typeof blobSASSignatureValues.expiryTime === "string"
        ? blobSASSignatureValues.expiryTime
        : truncatedISO8061Date(blobSASSignatureValues.expiryTime, false),
    getCanonicalName(
      accountName,
      blobSASSignatureValues.containerName,
      blobSASSignatureValues.blobName
    ),
    blobSASSignatureValues.signedObjectId,
    blobSASSignatureValues.signedTenantId,
    blobSASSignatureValues.signedStartsOn,
    blobSASSignatureValues.signedExpiresOn,
    blobSASSignatureValues.signedService,
    blobSASSignatureValues.signedVersion,
    blobSASSignatureValues.ipRange === undefined
      ? ""
      : typeof blobSASSignatureValues.ipRange === "string"
        ? blobSASSignatureValues.ipRange
        : ipRangeToString(blobSASSignatureValues.ipRange),
    blobSASSignatureValues.protocol ? blobSASSignatureValues.protocol : "",
    blobSASSignatureValues.version,
    resource,
    undefined, // blob version timestamp,
    blobSASSignatureValues.cacheControl,
    blobSASSignatureValues.contentDisposition,
    blobSASSignatureValues.contentEncoding,
    blobSASSignatureValues.contentLanguage,
    blobSASSignatureValues.contentType,
  ].join("\n");

  const signature = computeHMACSHA256(stringToSign, userDelegationKeyValue);
  return [signature, stringToSign];
}

function generateBlobSASSignatureWithUDK20200210(
  blobSASSignatureValues: IBlobSASSignatureValues,
  resource: BlobSASResourceType,
  accountName: string,
  userDelegationKeyValue: Buffer
): [string, string] {
  if (
    !blobSASSignatureValues.identifier &&
    (!blobSASSignatureValues.permissions && !blobSASSignatureValues.expiryTime)
  ) {
    throw new RangeError(
      // tslint:disable-next-line:max-line-length
      "generateBlobSASSignature(): Must provide 'permissions' and 'expiryTime' for Blob SAS generation when 'identifier' is not provided."
    );
  }

  const verifiedPermissions = blobSASSignatureValues.permissions;

  // Signature is generated on the un-url-encoded values.
  const stringToSign = [
    verifiedPermissions ? verifiedPermissions : "",
    blobSASSignatureValues.startTime === undefined
      ? ""
      : typeof blobSASSignatureValues.startTime === "string"
        ? blobSASSignatureValues.startTime
        : truncatedISO8061Date(blobSASSignatureValues.startTime, false),
    blobSASSignatureValues.expiryTime === undefined
      ? ""
      : typeof blobSASSignatureValues.expiryTime === "string"
        ? blobSASSignatureValues.expiryTime
        : truncatedISO8061Date(blobSASSignatureValues.expiryTime, false),
    getCanonicalName(
      accountName,
      blobSASSignatureValues.containerName,
      blobSASSignatureValues.blobName
    ),
    blobSASSignatureValues.signedObjectId,
    blobSASSignatureValues.signedTenantId,
    blobSASSignatureValues.signedStartsOn,
    blobSASSignatureValues.signedExpiresOn,
    blobSASSignatureValues.signedService,
    blobSASSignatureValues.signedVersion,
    undefined, // blobSASSignatureValues.preauthorizedAgentObjectId,
    undefined, // agentObjectId
    undefined, // blobSASSignatureValues.correlationId,
    blobSASSignatureValues.ipRange === undefined
      ? ""
      : typeof blobSASSignatureValues.ipRange === "string"
        ? blobSASSignatureValues.ipRange
        : ipRangeToString(blobSASSignatureValues.ipRange),
    blobSASSignatureValues.protocol ? blobSASSignatureValues.protocol : "",
    blobSASSignatureValues.version,
    resource,
    undefined, // blob versiontimestamp,
    blobSASSignatureValues.cacheControl,
    blobSASSignatureValues.contentDisposition,
    blobSASSignatureValues.contentEncoding,
    blobSASSignatureValues.contentLanguage,
    blobSASSignatureValues.contentType,
  ].join("\n");

  const signature = computeHMACSHA256(stringToSign, userDelegationKeyValue);
  return [signature, stringToSign];
}

function generateBlobSASBlobSASSignatureWithUDK20201206(
  blobSASSignatureValues: IBlobSASSignatureValues,
  resource: BlobSASResourceType,
  accountName: string,
  userDelegationKeyValue: Buffer
): [string, string] {
  if (
    !blobSASSignatureValues.identifier &&
    (!blobSASSignatureValues.permissions && !blobSASSignatureValues.expiryTime)
  ) {
    throw new RangeError(
      // tslint:disable-next-line:max-line-length
      "generateBlobSASSignature(): Must provide 'permissions' and 'expiryTime' for Blob SAS generation when 'identifier' is not provided."
    );
  }

  const verifiedPermissions = blobSASSignatureValues.permissions;

  // Signature is generated on the un-url-encoded values.
  const stringToSign = [
    verifiedPermissions ? verifiedPermissions : "",
    blobSASSignatureValues.startTime === undefined
      ? ""
      : typeof blobSASSignatureValues.startTime === "string"
        ? blobSASSignatureValues.startTime
        : truncatedISO8061Date(blobSASSignatureValues.startTime, false),
    blobSASSignatureValues.expiryTime === undefined
      ? ""
      : typeof blobSASSignatureValues.expiryTime === "string"
        ? blobSASSignatureValues.expiryTime
        : truncatedISO8061Date(blobSASSignatureValues.expiryTime, false),
    getCanonicalName(
      accountName,
      blobSASSignatureValues.containerName,
      resource === BlobSASResourceType.Blob
        ? blobSASSignatureValues.blobName
        : ""
    ),
    blobSASSignatureValues.signedObjectId,
    blobSASSignatureValues.signedTenantId,
    blobSASSignatureValues.signedStartsOn,
    blobSASSignatureValues.signedExpiresOn,
    blobSASSignatureValues.signedService,
    blobSASSignatureValues.signedVersion,
    undefined, // blobSASSignatureValues.preauthorizedAgentObjectId,
    undefined, // agentObjectId
    undefined, // blobSASSignatureValues.correlationId,
    blobSASSignatureValues.ipRange === undefined
      ? ""
      : typeof blobSASSignatureValues.ipRange === "string"
        ? blobSASSignatureValues.ipRange
        : ipRangeToString(blobSASSignatureValues.ipRange),
    blobSASSignatureValues.protocol ? blobSASSignatureValues.protocol : "",
    blobSASSignatureValues.version,
    resource,
    undefined, // blob version timestamp,
    blobSASSignatureValues.encryptionScope,
    blobSASSignatureValues.cacheControl,
    blobSASSignatureValues.contentDisposition,
    blobSASSignatureValues.contentEncoding,
    blobSASSignatureValues.contentLanguage,
    blobSASSignatureValues.contentType,
  ].join("\n");

  const signature = computeHMACSHA256(stringToSign, userDelegationKeyValue);
  return [signature, stringToSign];
}

function generateBlobSASBlobSASSignatureWithUDK20250705(
  blobSASSignatureValues: IBlobSASSignatureValues,
  resource: BlobSASResourceType,
  accountName: string,
  userDelegationKeyValue: Buffer
): [string, string] {
  if (
    !blobSASSignatureValues.identifier &&
    (!blobSASSignatureValues.permissions && !blobSASSignatureValues.expiryTime)
  ) {
    throw new RangeError(
      // tslint:disable-next-line:max-line-length
      "generateBlobSASSignature(): Must provide 'permissions' and 'expiryTime' for Blob SAS generation when 'identifier' is not provided."
    );
  }

  const verifiedPermissions = blobSASSignatureValues.permissions;

  // Signature is generated on the un-url-encoded values.
  const stringToSign = [
    verifiedPermissions ? verifiedPermissions : "",
    blobSASSignatureValues.startTime === undefined
      ? ""
      : typeof blobSASSignatureValues.startTime === "string"
        ? blobSASSignatureValues.startTime
        : truncatedISO8061Date(blobSASSignatureValues.startTime, false),
    blobSASSignatureValues.expiryTime === undefined
      ? ""
      : typeof blobSASSignatureValues.expiryTime === "string"
        ? blobSASSignatureValues.expiryTime
        : truncatedISO8061Date(blobSASSignatureValues.expiryTime, false),
    getCanonicalName(
      accountName,
      blobSASSignatureValues.containerName,
      resource === BlobSASResourceType.Blob
        ? blobSASSignatureValues.blobName
        : ""
    ),
    blobSASSignatureValues.signedObjectId,
    blobSASSignatureValues.signedTenantId,
    blobSASSignatureValues.signedStartsOn,
    blobSASSignatureValues.signedExpiresOn,
    blobSASSignatureValues.signedService,
    blobSASSignatureValues.signedVersion,
    undefined, // blobSASSignatureValues.preauthorizedAgentObjectId,
    undefined, // agentObjectId
    undefined, // blobSASSignatureValues.correlationId,
    blobSASSignatureValues.delegatedUserTenantId, // SignedKeyDelegatedUserTenantId, will be added in a future release.
    blobSASSignatureValues.delegatedUserObjectId, // SignedDelegatedUserObjectId, will be added in future release.
    blobSASSignatureValues.ipRange === undefined
      ? ""
      : typeof blobSASSignatureValues.ipRange === "string"
        ? blobSASSignatureValues.ipRange
        : ipRangeToString(blobSASSignatureValues.ipRange),
    blobSASSignatureValues.protocol ? blobSASSignatureValues.protocol : "",
    blobSASSignatureValues.version,
    resource,
    undefined, // blob version timestamp,
    blobSASSignatureValues.encryptionScope,
    blobSASSignatureValues.cacheControl,
    blobSASSignatureValues.contentDisposition,
    blobSASSignatureValues.contentEncoding,
    blobSASSignatureValues.contentLanguage,
    blobSASSignatureValues.contentType,
  ].join("\n");

  const signature = computeHMACSHA256(stringToSign, userDelegationKeyValue);
  return [signature, stringToSign];
}

function getCanonicalName(
  accountName: string,
  containerName: string,
  blobName?: string
): string {
  // Container: "/blob/account/containerName"
  // Blob:      "/blob/account/containerName/blobName"
  const elements: string[] = [`/blob/${accountName}/${containerName}`];
  if (blobName) {
    elements.push(`/${blobName}`);
  }
  return elements.join("");
}
