// This class provides a simple abstraction, and accepts the
// body and headers from debug logs for resubmission and repro
import axios, { AxiosResponse } from "axios";
import { axiosRequestConfig } from "./table.entity.tests.utils.for.rest";
import TableEntityTestConfig from "../models/table.entity.test.config";
import {
  AccountSasPermissions,
  AzureNamedKeyCredential,
  AzureSASCredential,
  generateAccountSas
} from "@azure/data-tables";

/**
 * Encodes apostrophes in the request path as %27.
 *
 * The SharedKeyLite signature is computed over the canonicalized resource with
 * apostrophes encoded as %27 (see axiosRequestConfig). Older axios (0.x)
 * percent-encoded apostrophes on the wire automatically, so the transmitted
 * path matched the signed path. axios 1.x sends apostrophes literally, so we
 * must encode them explicitly here to keep the wire path and the signed path
 * consistent and avoid 403 AuthorizationFailure.
 *
 * @param {string} path
 * @return {string}
 */
function encodePathForRequest(path: string): string {
  return path.replace(/'/g, "%27");
}

/**
 * Submits POST request to Azurite table service on the path given
 * This could be modified to accept the entire URL, rather than just path
 * ToDo: Need to consider cases with query strings etc.
 *
 * @export
 * @param {string} path
 * @param {string} body
 * @param {*} headers
 * @return {Promise<string>}
 */
export async function postToAzurite(
  path: string,
  body: string,
  headers: any
): Promise<AxiosResponse<any, any>> {
  const url = `${TableEntityTestConfig.protocol}://${
    TableEntityTestConfig.host
  }:${TableEntityTestConfig.port}/${
    TableEntityTestConfig.accountName
  }/${encodePathForRequest(path)}/?${generateSas()}`;
  const requestConfig = axiosRequestConfig(url, path, headers);
  const result = await axios.post(url, body, requestConfig);
  return result;
}

/**
 * Submits POST request to Azurite table service on the path given
 * This could be modified to accept the entire URL, rather than just path
 * ToDo: Need to consider cases with query strings etc.
 *
 * @export
 * @param {string} hostName
 * @param {string} path
 * @param {string} body
 * @param {*} headers
 * @return {Promise<string>}
 */
export async function postToAzuriteProductionUrl(
  hostName: string,
  path: string,
  body: string,
  headers: any
): Promise<AxiosResponse<any, any>> {
  const url = `${TableEntityTestConfig.protocol}://${
    hostName
  }:${TableEntityTestConfig.port}/${encodePathForRequest(path)}/?${generateSas()}`;
  const requestConfig = axiosRequestConfig(url, path, headers, true);
  const result = await axios.post(url, body, requestConfig);
  return result;
}

/**
 * Submits GET request to Azurite table service on the path given
 *
 * @export
 * @param {string} path
 * @param {*} headers
 * @return {Promise<string>}
 */
export async function getToAzurite(
  path: string,
  headers: any,
  queryString?: string
): Promise<AxiosResponse<any, any>> {
  if (undefined === queryString) {
    queryString = "";
  }
  const url = `${TableEntityTestConfig.protocol}://${TableEntityTestConfig.host}:${TableEntityTestConfig.port}/${TableEntityTestConfig.accountName}/${encodePathForRequest(path)}${queryString}`;
  const requestConfig = axiosRequestConfig(url, path, headers);
  const result = await axios.get(url, requestConfig);
  return result;
}

/**
 * Submits GET request to Azurite table service on the path given
 *
 * @export
 * @param {string} hostName
 * @param {string} path
 * @param {*} headers
 * @return {Promise<string>}
 */
export async function getToAzuriteProductionUrl(
  hostName: string,
  path: string,
  headers: any,
  queryString?: string
): Promise<AxiosResponse<any, any>> {
  if (undefined === queryString) {
    queryString = "";
  }
  const url = `${TableEntityTestConfig.protocol}://${hostName}:${TableEntityTestConfig.port}/${encodePathForRequest(path)}${queryString}`;
  const requestConfig = axiosRequestConfig(url, path, headers, true);
  const result = await axios.get(url, requestConfig);
  return result;
}

/**
 * Generates the account SAS signature to allow raw REST to connect to storage
 * without using an SDK connection.
 * This needs to be appended to the URL.
 * @return {*}  {string}
 */
function generateSas(): string {
  // We need a NamedKeyCredential to generate the SAS token
  const cred = new AzureNamedKeyCredential(
    TableEntityTestConfig.accountName,
    TableEntityTestConfig.sharedKey
  );
  // We set the permissions we want on the SAS token
  // If non is specified, only list is granted
  const permissions: AccountSasPermissions = {
    // Grants permission to list tables
    list: true,
    // Grants permission to create tables
    write: true,
    // Grants permission to create entities
    add: true,
    // Grants permission to query entities
    query: true,
    // Grants permission to delete tables and entities
    delete: true
  };

  const expiriesOn = new Date();
  expiriesOn.setDate(expiriesOn.getDate() + 1);

  // Generate an account SAS with the NamedKeyCredential and the permissions set previously
  const accountSas = generateAccountSas(cred, {
    permissions,
    expiresOn: expiriesOn
  });

  return new AzureSASCredential(accountSas).signature;
}

/**
 * Sends raw patch request to Azurite
 *
 * @export
 * @param {string} path
 * @param {string} body
 * @param {*} headers
 * @return {*}  {Promise<AxiosResponse<any, any>>}
 */
export async function patchToAzurite(
  path: string,
  body: string,
  headers: any
): Promise<AxiosResponse<any, any>> {
  const url = `${TableEntityTestConfig.protocol}://${
    TableEntityTestConfig.host
  }:${TableEntityTestConfig.port}/${
    TableEntityTestConfig.accountName
  }/${encodePathForRequest(path)}?${generateSas()}`;
  const requestConfig = axiosRequestConfig(url, path, headers);
  const result = await axios.patch(url, body, requestConfig);
  return result;
}

/**
 * Sends raw put request to Azurite
 *
 * @export
 * @param {string} path
 * @param {string} body
 * @param {*} headers
 * @return {*}  {Promise<AxiosResponse<any, any>>}
 */
export async function putToAzurite(
  path: string,
  body: string,
  headers: any
): Promise<AxiosResponse<any, any>> {
  const url = `${TableEntityTestConfig.protocol}://${
    TableEntityTestConfig.host
  }:${TableEntityTestConfig.port}/${
    TableEntityTestConfig.accountName
  }/${encodePathForRequest(path)}?${generateSas()}`;
  try {
    const requestConfig = axiosRequestConfig(url, path, headers);
    const result = await axios.put(url, body, requestConfig);
    return result;
  } catch (err: any) {
    throw err;
  }
}

/**
 * Sends raw merge request to Azurite
 *
 * @export
 * @param {string} path
 * @param {string} body
 * @param {*} headers
 * @return {*}  {Promise<AxiosResponse<any, any>>}
 */
export async function mergeToAzurite(
  path: string,
  body: string,
  headers: any
): Promise<AxiosResponse<any, any>> {
  const url = `${TableEntityTestConfig.protocol}://${
    TableEntityTestConfig.host
  }:${TableEntityTestConfig.port}/${
    TableEntityTestConfig.accountName
  }/${encodePathForRequest(path)}?${generateSas()}`;
  const requestConfig = axiosRequestConfig(url, path, headers);
  const result = await axios({
    method: "merge",
    url,
    data: body,
    headers: requestConfig.headers
  });
  return result;
}

/**
 * Sends raw delete request to Azurite
 *
 * @export
 * @param {string} path
 * @param {string} body
 * @param {*} headers
 * @return {*}  {Promise<AxiosResponse<any, any>>}
 */
export async function deleteToAzurite(
  path: string,
  body: string,
  headers: any
): Promise<AxiosResponse<any, any>> {
  const url = `${TableEntityTestConfig.protocol}://${
    TableEntityTestConfig.host
  }:${TableEntityTestConfig.port}/${
    TableEntityTestConfig.accountName
  }/${encodePathForRequest(path)}?${generateSas()}`;
  const requestConfig = axiosRequestConfig(url, path, headers);
  const result = await axios({
    method: "delete",
    url,
    data: body,
    headers: requestConfig.headers
  });
  return result;
}
