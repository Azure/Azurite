import {
  computeHMACSHA256,
  getURLQueries
} from "../../../src/common/utils/utils";
import { HeaderConstants } from "../../../src/table/utils/constants";
import TableEntityTestConfig from "../models/table.entity.test.config";

const key1 = Buffer.from(TableEntityTestConfig.sharedKey, "base64");

/**
 * Creates the Axios request options using shared key lite
 * Authorization header for Azurite table request
 *
 * @export
 * @param {string} url
 * @param {string} path
 * @param {*} headers
 * @param {boolean} productionStyle
 * @return {*}  axios request options
 */
export function axiosRequestConfig(
  url: string,
  path: string,
  headersIn: any,
  productionStyle: boolean = false
): any {
  const stringToSign = createStringToSignForSharedKeyLite(url, path, headersIn, productionStyle);
  const signature1 = computeHMACSHA256(stringToSign, key1);
  const authValue = `SharedKeyLite ${TableEntityTestConfig.accountName}:${signature1}`;
  const headers = Object.assign(headersIn, { Authorization: authValue });
  return {
    headers
  };
}

/**
 * Create signed value according to shared key lite sign rules.
 * @see https://docs.microsoft.com/en-us/rest/api/storageservices/authenticate-with-shared-key
 *
 * @private
 * @param {string} url
 * @param {string} path
 * @param {any} headers
 * @param {boolean} productionStyle
 * @returns {string}
 */
export function createStringToSignForSharedKeyLite(
  url: string,
  path: string,
  headers: any,
  productionStyle: boolean
): string {
  const stringToSign: string =
    [
      getHeaderValueToSign(HeaderConstants.DATE, headers) ||
        getHeaderValueToSign(HeaderConstants.X_MS_DATE, headers)
    ].join("\n") +
    "\n" +
    getCanonicalizedResourceString(
      url,
      TableEntityTestConfig.accountName,
      productionStyle ? `/${path.replace(/'/g, "%27")}`: `/${TableEntityTestConfig.accountName}/${path.replace(/'/g, "%27")}`
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
    path = getPath(authenticationPath);
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
  if (url.indexOf("-secondary") !== -1){
    return url.replace('-secondary', '');
  }
  return url;
}
