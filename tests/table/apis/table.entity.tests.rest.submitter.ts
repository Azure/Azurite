// This class provides a simple abstraction, and accepts the
// body and headers from debug logs for resubmission and repro

import axios, { AxiosResponse } from "axios";
import TableEntityTestConfig from "./table.entity.test.config";
import { axiosRequestConfig } from "./table.entity.tests.utils.for.rest";

/**
 * Submits POST request to Azurite table service on the path given
 * This could be modified to accept the entire URL, rather than just path
 * ToDo: Need to consider cases with query strings etc.
 *
 * @export
 * @param {string} path
 * @param {string} body
 * @param {*} headers
 * @return {Promise<AxiosResponse<any>}
 */
export async function postToAzurite(
  path: string,
  body: string,
  headers: any
): Promise<AxiosResponse<any>> {
  const url = `${TableEntityTestConfig.protocol}://${TableEntityTestConfig.host}:${TableEntityTestConfig.port}/${TableEntityTestConfig.accountName}/${path}`;
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
 * @param {string} path
 * @param {*} headers
 * @return {Promise<AxiosResponse<any>}
 */
export async function getToAzurite(
  path: string,
  headers: any
): Promise<AxiosResponse<any>> {
  const url = `${TableEntityTestConfig.protocol}://${TableEntityTestConfig.host}:${TableEntityTestConfig.port}/${TableEntityTestConfig.accountName}/${path}`;
  const requestConfig = axiosRequestConfig(url, path, headers);
  const result = await axios.get(url, requestConfig);
  return result;
}
