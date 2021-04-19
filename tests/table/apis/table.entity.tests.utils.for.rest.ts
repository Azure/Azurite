import { computeHMACSHA256 } from "../../../src/common/utils/utils";
import { HeaderConstants } from "../../../src/table/utils/constants";
import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME } from "../../testutils";

export const accountName = EMULATOR_ACCOUNT_NAME;
export const sharedKey = EMULATOR_ACCOUNT_KEY;
const key1 = Buffer.from(sharedKey, "base64");
// need to create the shared key
// using SharedKeyLite as it is quick and easy
export function axiosRequestConfig(stringToSign: string) {
  const signature1 = computeHMACSHA256(stringToSign, key1);
  const authValue = `SharedKeyLite ${accountName}:${signature1}`;
  return {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata",
      Authorization: authValue
    }
  };
}

/**
 * Create signed value according to shared key lite sign rules.
 * @see https://docs.microsoft.com/en-us/rest/api/storageservices/authenticate-with-shared-key
 *
 * @private
 * @param {string} url
 * @param {any} headers
 * @returns {string}
 */
export function createSignatureForSharedKeyLite(
  url: string,
  headers: any
): string {
  const stringToSign: string =
    [
      getHeaderValueToSign(HeaderConstants.DATE, headers) ||
        getHeaderValueToSign(HeaderConstants.X_MS_DATE, headers)
    ].join("\n") +
    "\n" +
    getCanonicalizedResourceString(
      url,
      accountName,
      "/devstoreaccount1/Tables"
    );

  return stringToSign;
}
/**
 * Retrieve header value according to shared key sign rules.
 * @see https://docs.microsoft.com/en-us/rest/api/storageservices/authenticate-with-shared-key
 *
 * @private
 * @param {WebResource} request
 * @param {string} headerName
 * @returns {string}
 * @memberof SharedKeyCredentialPolicy
 */
function getHeaderValueToSign(headerName: string, headers: any): string {
  const value = headers[headerName];

  if (!value) {
    return "";
  }

  // When using version 2015-02-21 or later, if Content-Length is zero, then
  // set the Content-Length part of the StringToSign to an empty string.
  // https://docs.microsoft.com/en-us/rest/api/storageservices/authenticate-with-shared-key
  if (headerName === HeaderConstants.CONTENT_LENGTH && value === "0") {
    return "";
  }

  return value;
}
/**
 * Retrieves canonicalized resource string.
 *
 * @private
 * @param {IRequest} request
 * @returns {string}
 */
export function getCanonicalizedResourceString(
  url: string,
  account: string,
  authenticationPath?: string
): string {
  let path = getPath(url) || "/";

  // For secondary account, we use account name (without "-secondary") for the path
  if (authenticationPath !== undefined) {
    path = authenticationPath;
  }

  let canonicalizedResourceString: string = "";
  canonicalizedResourceString += `/${account}${path}`;

  const queries = getURLQueries(url);
  const lowercaseQueries: { [key: string]: string } = {};
  if (queries) {
    const queryKeys: string[] = [];
    for (const key in queries) {
      if (queries.hasOwnProperty(key)) {
        const lowercaseKey = key.toLowerCase();
        lowercaseQueries[lowercaseKey] = queries[key];
        queryKeys.push(lowercaseKey);
      }
    }

    if (queryKeys.includes("comp")) {
      canonicalizedResourceString += "?comp=" + lowercaseQueries.comp;
    }

    // queryKeys.sort();
    // for (const key of queryKeys) {
    //   canonicalizedResourceString += `\n${key}:${decodeURIComponent(
    //     lowercaseQueries[key]
    //   )}`;
    // }
  }

  return canonicalizedResourceString;
}
/**
 * Retrieves path from URL.
 *
 * @private
 * @param {string} url
 * @returns {string}
 */
function getPath(url: string): string {
  return url;
}
/**
 * Retrieves queries from URL.
 *
 * @private
 * @param {string} url
 * @returns {string}
 */
function getURLQueries(url: string): { [key: string]: string } {
  const lowercaseQueries: { [key: string]: string } = {};
  return lowercaseQueries;
}
