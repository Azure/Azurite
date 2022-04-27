import { SasIPRange } from "@azure/storage-blob";

import {
  computeHMACSHA256,
  truncatedISO8061Date
} from "../utils/utils";
import AccountSASPermissions from "./AccountSASPermissions";
import AccountSASResourceTypes from "./AccountSASResourceTypes";
import AccountSASServices from "./AccountSASServices";
import { ipRangeToString } from "./IIPRange";

/**
 * Protocols for generated SAS.
 *
 * @export
 * @enum {number}
 */
export enum SASProtocol {
  /**
   * Protocol that allows HTTPS only
   */
  HTTPS = "https",

  /**
   * Protocol that allows both HTTPS and HTTP
   */
  HTTPSandHTTP = "https,http"
}

/**
 * IAccountSASSignatureValues is used to generate a Shared Access Signature (SAS) for an Azure Storage account.
 *
 * @see https://docs.microsoft.com/en-us/azure/storage/common/storage-dotnet-shared-access-signature-part-1
 * for more conceptual information on SAS
 *
 * @see https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas
 * for descriptions of the parameters, including which are required
 *
 * @export
 * @class IAccountSASSignatureValues
 */
export interface IAccountSASSignatureValues {
  /**
   * If not provided, this defaults to the service version targeted by this version of the library.
   *
   * @type {string}
   * @memberof IAccountSASSignatureValues
   */
  version: string;

  /**
   * Optional. SAS protocols allowed.
   *
   * @type {SASProtocol | string}
   * @memberof IAccountSASSignatureValues
   */
  protocol?: SASProtocol | string;

  /**
   * Optional. When the SAS will take effect.
   *
   * @type {Date | string}
   * @memberof IAccountSASSignatureValues
   */
  startTime?: Date | string;

  /**
   * The time after which the SAS will no longer work.
   *
   * @type {Date | string}
   * @memberof IAccountSASSignatureValues
   */
  expiryTime: Date | string;

  /**
   * Specifies which operations the SAS user may perform. Please refer to {@link AccountSASPermissions} for help
   * constructing the permissions string.
   *
   * @type {AccountSASPermissions | string}
   * @memberof IAccountSASSignatureValues
   */
  permissions: AccountSASPermissions | string;

  /**
   * Optional. IP range allowed.
   *
   * @type {SasIPRange | string}
   * @memberof IAccountSASSignatureValues
   */
  ipRange?: SasIPRange | string;

  /**
   * The values that indicate the services accessible with this SAS. Please refer to {@link AccountSASServices} to
   * construct this value.
   *
   * @type {AccountSASServices | string}
   * @memberof IAccountSASSignatureValues
   */
  services: AccountSASServices | string;

  /**
   * The values that indicate the resource types accessible with this SAS. Please refer
   * to {@link AccountSASResourceTypes} to construct this value.
   *
   * @type {AccountSASResourceType | string}
   * @memberof IAccountSASSignatureValues
   */
  resourceTypes: AccountSASResourceTypes | string;

  /**
   * Indicates the encryption scope to use to encrypt the request contents.
   * This field is supported with version 2020-12-06 or later.
   *
   * @type {string}
   * @memberof IAccountSASSignatureValues
   */
   encryptionScope?: string;
}

/**
 * Generates signature string from account SAS parameters.
 *
 * @see https://docs.microsoft.com/en-us/rest/api/storageservices/constructing-an-account-sas
 *
 * @param {SharedKeyCredential} sharedKeyCredential
 * @param {string} accountName
 * @param {Buffer} sharedKey
 * @returns {[string, string]} signature and stringToSign
 * @memberof IAccountSASSignatureValues
 */
export function generateAccountSASSignature(
  accountSASSignatureValues: IAccountSASSignatureValues,
  accountName: string,
  sharedKey: Buffer
): [string, string] {

  if (accountSASSignatureValues.version >= "2020-12-06") {
    return generateAccountSASSignature20201206(
      accountSASSignatureValues,
      accountName,
      sharedKey
    );
  }
  else {
    return generateAccountSASSignature20150405(
      accountSASSignatureValues,
      accountName,
      sharedKey
    );
  }
}

function generateAccountSASSignature20201206(
  accountSASSignatureValues: IAccountSASSignatureValues,
  accountName: string,
  sharedKey: Buffer
): [string, string] {
  const parsedPermissions = accountSASSignatureValues.permissions.toString();
  const parsedServices = accountSASSignatureValues.services.toString();
  const parsedResourceTypes = accountSASSignatureValues.resourceTypes.toString();
  const parsedStartTime =
    accountSASSignatureValues.startTime === undefined
      ? ""
      : typeof accountSASSignatureValues.startTime === "string"
      ? accountSASSignatureValues.startTime
      : truncatedISO8061Date(accountSASSignatureValues.startTime, false);
  const parsedExpiryTime =
    typeof accountSASSignatureValues.expiryTime === "string"
      ? accountSASSignatureValues.expiryTime
      : truncatedISO8061Date(accountSASSignatureValues.expiryTime, false);
  const parsedIPRange =
    accountSASSignatureValues.ipRange === undefined
      ? ""
      : typeof accountSASSignatureValues.ipRange === "string"
      ? accountSASSignatureValues.ipRange
      : ipRangeToString(accountSASSignatureValues.ipRange);
  const parsedProtocol =
    accountSASSignatureValues.protocol === undefined
      ? ""
      : accountSASSignatureValues.protocol;
  const version = accountSASSignatureValues.version;
  const encryptionScope = accountSASSignatureValues.encryptionScope;

  const stringToSign = [
    accountName,
    parsedPermissions,
    parsedServices,
    parsedResourceTypes,
    parsedStartTime,
    parsedExpiryTime,
    parsedIPRange,
    parsedProtocol,
    version,
    encryptionScope,
    "" // Account SAS requires an additional newline character
  ].join("\n");

  const signature: string = computeHMACSHA256(stringToSign, sharedKey);
  return [signature, stringToSign];
}

function generateAccountSASSignature20150405(
  accountSASSignatureValues: IAccountSASSignatureValues,
  accountName: string,
  sharedKey: Buffer
): [string, string] {
  const parsedPermissions = accountSASSignatureValues.permissions.toString();
  const parsedServices = accountSASSignatureValues.services.toString();
  const parsedResourceTypes = accountSASSignatureValues.resourceTypes.toString();
  const parsedStartTime =
    accountSASSignatureValues.startTime === undefined
      ? ""
      : typeof accountSASSignatureValues.startTime === "string"
      ? accountSASSignatureValues.startTime
      : truncatedISO8061Date(accountSASSignatureValues.startTime, false);
  const parsedExpiryTime =
    typeof accountSASSignatureValues.expiryTime === "string"
      ? accountSASSignatureValues.expiryTime
      : truncatedISO8061Date(accountSASSignatureValues.expiryTime, false);
  const parsedIPRange =
    accountSASSignatureValues.ipRange === undefined
      ? ""
      : typeof accountSASSignatureValues.ipRange === "string"
      ? accountSASSignatureValues.ipRange
      : ipRangeToString(accountSASSignatureValues.ipRange);
  const parsedProtocol =
    accountSASSignatureValues.protocol === undefined
      ? ""
      : accountSASSignatureValues.protocol;
  const version = accountSASSignatureValues.version;

  const stringToSign = [
    accountName,
    parsedPermissions,
    parsedServices,
    parsedResourceTypes,
    parsedStartTime,
    parsedExpiryTime,
    parsedIPRange,
    parsedProtocol,
    version,
    "" // Account SAS requires an additional newline character
  ].join("\n");

  const signature: string = computeHMACSHA256(stringToSign, sharedKey);
  return [signature, stringToSign];
}
