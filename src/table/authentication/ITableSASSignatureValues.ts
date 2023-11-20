import {
  computeHMACSHA256,
  truncatedISO8061Date
} from "../../common/utils/utils";
import { SASProtocol } from "../../common/authentication/IAccountSASSignatureValues";
import { IIPRange, ipRangeToString } from "../../common/authentication/IIPRange";

/**
 * ITableSASSignatureValues is used to help generating Table service SAS tokens for containers or tables.
 *
 * @export
 * @class ITableSASSignatureValues
 */
export interface ITableSASSignatureValues {
  /**
   * The version of the service this SAS will target. If not specified, it will default to the version targeted by the
   * library.
   *
   * @type {string}
   * @memberof ITableSASSignatureValues
   */
  version: string;

  /**
   * Optional. SAS protocols, HTTPS only or HTTPSandHTTP
   *
   * @type {SASProtocol | string}
   * @memberof ITableSASSignatureValues
   */
  protocol?: SASProtocol | string;

  /**
   * Optional. When the SAS will take effect.
   *
   * @type {Date | string}
   * @memberof ITableSASSignatureValues
   */
  startTime?: Date | string;

  /**
   * Optional only when identifier is provided. The time after which the SAS will no longer work.
   *
   * @type {Date | string}
   * @memberof ITableSASSignatureValues
   */
  expiryTime?: Date | string;

  /**
   * Optional only when identifier is provided.
   * Please refer to either {@link ContainerSASPermissions} or {@link TableSASPermissions} depending on the resource
   * being accessed for help constructing the permissions string.
   *
   * @type {string}
   * @memberof ITableSASSignatureValues
   */
  permissions?: string;

  /**
   * Optional. IP ranges allowed in this SAS.
   *
   * @type {IIPRange | string}
   * @memberof ITableSASSignatureValues
   */
  ipRange?: IIPRange | string;

  /**
   * The name of the table the SAS user may access.
   *
   * @type {string}
   * @memberof ITableSASSignatureValues
   */
  tableName: string;

  /**
   * Optional. The name of the access policy on the container this SAS references if any.
   *
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/establishing-a-stored-access-policy
   *
   * @type {string}
   * @memberof ITableSASSignatureValues
   */
  identifier?: string;

  startingPartitionKey?: string;
  startingRowKey?: string;
  endingPartitionKey?: string;
  endingRowKey?: string;
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
 * @param {ITableSASSignatureValues} tableSASSignatureValues
 * @param {TableSASResourceType} resource
 * @param {string} accountName
 * @param {Buffer} sharedKey
 * @returns {[string, string]} signature and stringToSign
 */
export function generateTableSASSignature(
  tableSASSignatureValues: ITableSASSignatureValues,
  accountName: string,
  sharedKey: Buffer
): [string, string] {
  if (tableSASSignatureValues.version >= "2018-11-09") {
    return generateTableSASSignature20181109(
      tableSASSignatureValues,
      accountName,
      sharedKey
    );
  } else {
    return generateTableSASSignature20150405(
      tableSASSignatureValues,
      accountName,
      sharedKey
    );
  }
}

function generateTableSASSignature20181109(
  tableSASSignatureValues: ITableSASSignatureValues,
  accountName: string,
  sharedKey: Buffer
): [string, string] {
  if (
    !tableSASSignatureValues.identifier &&
    (!tableSASSignatureValues.permissions &&
      !tableSASSignatureValues.expiryTime)
  ) {
    throw new RangeError(
      // tslint:disable-next-line:max-line-length
      "generateTableSASSignature(): Must provide 'permissions' and 'expiryTime' for Table SAS generation when 'identifier' is not provided."
    );
  }

  const version = tableSASSignatureValues.version;
  const verifiedPermissions = tableSASSignatureValues.permissions;

  // Signature is generated on the un-url-encoded values.
  // TODO: Check whether validating the snapshot is necessary.
  const stringToSign = [
    verifiedPermissions ? verifiedPermissions : "",
    tableSASSignatureValues.startTime === undefined
      ? ""
      : typeof tableSASSignatureValues.startTime === "string"
      ? tableSASSignatureValues.startTime
      : truncatedISO8061Date(tableSASSignatureValues.startTime, false),
    tableSASSignatureValues.expiryTime === undefined
      ? ""
      : typeof tableSASSignatureValues.expiryTime === "string"
      ? tableSASSignatureValues.expiryTime
      : truncatedISO8061Date(tableSASSignatureValues.expiryTime, false),
    getCanonicalName(accountName, tableSASSignatureValues.tableName),
    tableSASSignatureValues.identifier, // TODO: ? tableSASSignatureValues.identifier : "",
    tableSASSignatureValues.ipRange
      ? typeof tableSASSignatureValues.ipRange === "string"
        ? tableSASSignatureValues.ipRange
        : ipRangeToString(tableSASSignatureValues.ipRange)
      : "",
    tableSASSignatureValues.protocol ? tableSASSignatureValues.protocol : "",
    version,
    tableSASSignatureValues.startingPartitionKey
      ? tableSASSignatureValues.startingPartitionKey
      : "",
    tableSASSignatureValues.startingRowKey
      ? tableSASSignatureValues.startingRowKey
      : "",
    tableSASSignatureValues.endingPartitionKey
      ? tableSASSignatureValues.endingPartitionKey
      : "",
    tableSASSignatureValues.endingRowKey
      ? tableSASSignatureValues.endingRowKey
      : ""
  ].join("\n");

  const signature = computeHMACSHA256(stringToSign, sharedKey);
  return [signature, stringToSign];
}

function generateTableSASSignature20150405(
  tableSASSignatureValues: ITableSASSignatureValues,

  accountName: string,
  sharedKey: Buffer
): [string, string] {
  if (
    !tableSASSignatureValues.identifier &&
    (!tableSASSignatureValues.permissions &&
      !tableSASSignatureValues.expiryTime)
  ) {
    throw new RangeError(
      // tslint:disable-next-line:max-line-length
      "generateTableSASSignature(): Must provide 'permissions' and 'expiryTime' for Table SAS generation when 'identifier' is not provided."
    );
  }

  const version = tableSASSignatureValues.version;
  const verifiedPermissions = tableSASSignatureValues.permissions;

  // Signature is generated on the un-url-encoded values.
  const stringToSign = [
    verifiedPermissions ? verifiedPermissions : "",
    tableSASSignatureValues.startTime === undefined
      ? ""
      : typeof tableSASSignatureValues.startTime === "string"
      ? tableSASSignatureValues.startTime
      : truncatedISO8061Date(tableSASSignatureValues.startTime, false),
    tableSASSignatureValues.expiryTime === undefined
      ? ""
      : typeof tableSASSignatureValues.expiryTime === "string"
      ? tableSASSignatureValues.expiryTime
      : truncatedISO8061Date(tableSASSignatureValues.expiryTime, false),
    getCanonicalName(accountName, tableSASSignatureValues.tableName),
    tableSASSignatureValues.identifier, // TODO: ? tableSASSignatureValues.identifier : "",
    tableSASSignatureValues.ipRange
      ? typeof tableSASSignatureValues.ipRange === "string"
        ? tableSASSignatureValues.ipRange
        : ipRangeToString(tableSASSignatureValues.ipRange)
      : "",
    tableSASSignatureValues.protocol ? tableSASSignatureValues.protocol : "",
    version,
    tableSASSignatureValues.startingPartitionKey
      ? tableSASSignatureValues.startingPartitionKey
      : "",
    tableSASSignatureValues.startingRowKey
      ? tableSASSignatureValues.startingRowKey
      : "",
    tableSASSignatureValues.endingPartitionKey
      ? tableSASSignatureValues.endingPartitionKey
      : "",
    tableSASSignatureValues.endingRowKey
      ? tableSASSignatureValues.endingRowKey
      : ""
  ].join("\n");

  const signature = computeHMACSHA256(stringToSign, sharedKey);
  return [signature, stringToSign];
}

function getCanonicalName(accountName: string, tableName: string): string {
  return `/table/${accountName}/${tableName.toLowerCase()}`;
}
