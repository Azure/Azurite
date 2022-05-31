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
  }/${path}/?${generateSas()}`;
  const requestConfig = axiosRequestConfig(url, path, headers);
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
  const url = `${TableEntityTestConfig.protocol}://${TableEntityTestConfig.host}:${TableEntityTestConfig.port}/${TableEntityTestConfig.accountName}/${path}${queryString}`;
  const requestConfig = axiosRequestConfig(url, path, headers);
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

  // Generate an account SAS with the NamedKeyCredential and the permissions set previously
  const accountSas = generateAccountSas(cred, {
    permissions,
    expiresOn: new Date("2022-12-12")
  });

  return new AzureSASCredential(accountSas).signature;
}
