import { createHash, createHmac, randomBytes } from "crypto";
import etag from "etag";
import { createWriteStream, PathLike } from "fs";
import { parse } from "url";
import * as xml2js from "xml2js";

/**
 * Generates a hash signature for an HTTP request or for a SAS.
 *
 * @param {string} stringToSign
 * @param {key} key
 * @returns {string}
 */
export function computeHMACSHA256(stringToSign: string, key: Buffer): string {
  return createHmac("sha256", key)
    .update(stringToSign, "utf8")
    .digest("base64");
}

/**
 * Rounds a date off to seconds.
 *
 * @export
 * @param {Date} date
 * @param {boolean} [withMilliseconds=true] If true, YYYY-MM-DDThh:mm:ss.fffffffZ will be returned;
 *                                          If false, YYYY-MM-DDThh:mm:ssZ will be returned.
 * @returns {string} Date string in ISO8061 format, with or without 7 milliseconds component
 */
export function truncatedISO8061Date(
  date: Date,
  withMilliseconds: boolean = true
): string {
  // Date.toISOString() will return like "2018-10-29T06:34:36.139Z"
  const dateString = date.toISOString();

  return withMilliseconds
    ? dateString.substring(0, dateString.length - 1) + "0000" + "Z"
    : dateString.substring(0, dateString.length - 5) + "Z";
}

// TODO: Align eTag with Azure Storage Service
export function newEtag(): string {
  return etag(`${new Date().getTime()}`);
}

export async function streamToLocalFile(
  stream: NodeJS.ReadableStream,
  path: PathLike
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const writeStream = createWriteStream(path);
    stream
      .on("error", reject)
      // .on("end", resolve)
      .pipe(writeStream)
      .on("close", resolve)
      .on("error", reject);
  });
}

export async function getMD5FromStream(
  stream: NodeJS.ReadableStream
): Promise<Uint8Array> {
  const hash = createHash("md5");
  return new Promise<Uint8Array>((resolve, reject) => {
    stream
      .on("data", data => {
        hash.update(data);
      })
      .on("end", () => {
        resolve(hash.digest());
      })
      .on("error", reject);
  });
}

export async function getMD5FromString(text: string): Promise<Uint8Array> {
  return createHash("md5")
    .update(text)
    .digest();
}

/**
 * Get URL query key value pairs from an URL string.
 *
 * @export
 * @param {string} url
 * @returns {{[key: string]: string}}
 */
export function getURLQueries(url: string): { [key: string]: string } {
  let queryString = parse(url).query;
  if (!queryString) {
    return {};
  }

  queryString = queryString.trim();
  queryString = queryString.startsWith("?")
    ? queryString.substr(1)
    : queryString;

  let querySubStrings: string[] = queryString.split("&");
  querySubStrings = querySubStrings.filter((value: string) => {
    const indexOfEqual = value.indexOf("=");
    const lastIndexOfEqual = value.lastIndexOf("=");
    return indexOfEqual > 0 && indexOfEqual === lastIndexOfEqual;
  });

  const queries: { [key: string]: string } = {};
  for (const querySubString of querySubStrings) {
    const splitResults = querySubString.split("=");
    const key: string = splitResults[0];
    const value: string = splitResults[1];
    queries[key] = value;
  }

  return queries;
}

/**
 * Default range value [0, Infinite] will be returned if all parameters not provided.
 *
 * @export
 * @param {string} [rangeHeaderValue]
 * @param {string} [xMsRangeHeaderValue]
 * @returns {[number, number]}
 */
export function deserializeRangeHeader(
  rangeHeaderValue?: string,
  xMsRangeHeaderValue?: string
): [number, number] {
  const range = xMsRangeHeaderValue || rangeHeaderValue;
  if (!range) {
    return [0, Infinity];
  }

  let parts = range.split("=");
  if (parts === undefined || parts.length !== 2) {
    throw new RangeError(
      `deserializeRangeHeader: raw range value ${range} is wrong.`
    );
  }

  parts = parts[1].split("-");
  if (parts === undefined || parts.length < 1 || parts.length > 2) {
    throw new RangeError(
      `deserializeRangeHeader: raw range value ${range} is wrong.`
    );
  }

  const startInclusive = parseInt(parts[0], 10);
  let endInclusive = Infinity;

  if (parts.length > 1 && parts[1] !== "") {
    endInclusive = parseInt(parts[1], 10);
  }

  if (startInclusive > endInclusive) {
    throw new RangeError(
      `deserializeRangeHeader: raw range value ${range} is wrong.`
    );
  }

  return [startInclusive, endInclusive];
}

/**
 * Deserialize range header into valid page ranges.
 * For example, "bytes=0-1023" will return [0, 1023].
 *
 * Default range value [0, Infinite] will be returned if all parameters not provided.
 *
 * @private
 * @param {string} [rangeHeaderValue]
 * @param {string} [xMsRangeHeaderValue]
 * @returns {([number, number] | undefined)}
 */

/**
 * validate the input name for queue or container.
 * @see https://docs.microsoft.com/en-us/rest/api/storageservices/naming-queues-and-metadata
 *
 * @export
 * @param {string} name
 * @returns {nameValidateCode} //0 for valid, 1 for outOfRange, 2 for invalid.
 */
export function isValidName(name: string): nameValidateCode {
  if (name === "") {
    return nameValidateCode.invalidName;
  }
  if (name.length < 3 || name.length > 63) {
    return nameValidateCode.outOfRange;
  }
  if (name.split("-").indexOf("") !== -1) {
    return nameValidateCode.invalidName;
  }

  const reg = new RegExp("^[0-9|a-z|-]*$");
  if (reg.test(name)) {
    return nameValidateCode.valid;
  }

  return nameValidateCode.invalidName;
}

// The code to indicate the validation result.
export enum nameValidateCode {
  valid,
  outOfRange,
  invalidUri,
  invalidName
}

/**
 * Generate a random code with given length
 *
 * @public
 * @param {number} len
 * @returns {string}
 * @memberof LokiQueueDataStore
 */
export function randomValueHex(len: number): string {
  return randomBytes(Math.ceil(len / 2))
    .toString("hex") // convert to hexadecimal format
    .slice(0, len); // return required number of characters
}

/**
 * Generate the popreceipt for a get messages request.
 *
 * @public
 * @param {Date} requestDate
 * @returns {string}
 * @memberof LokiQueueDataStore
 */
export function getPopReceipt(requestDate: Date): string {
  const encodedStr =
    requestDate
      .toUTCString()
      .split(" ")
      .slice(1, 5)
      .join("") + randomValueHex(4);
  return Buffer.from(encodedStr).toString("base64");
}

/**
 * Read the text from a readStream to a string.
 *
 * @export
 * @param {NodeJS.ReadableStream} data
 * @returns {Promise<string>}
 */
export async function readStreamToString(
  data: NodeJS.ReadableStream
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let res: string = "";
    data
      .on("readable", () => {
        let chunk;
        chunk = data.read();
        if (chunk) {
          res += chunk.toString();
        }
      })
      .on("end", () => {
        resolve(res);
      })
      .on("error", reject);
  });
}

/**
 * Get the byte size of a string in UTF8.
 *
 * @public
 * @param {Date} requestDate
 * @returns {string}
 * @memberof LokiQueueDataStore
 */
export function getUTF8ByteSize(text: string): number {
  return Buffer.from(text, "utf8").length;
}

/**
 * Retrive the value from XML body without ignoring the empty characters.
 *
 * @export
 * @param {string} param
 * @param {boolean} [explicitChildrenWithOrder=false]
 * @returns {Promise<any>}
 */
export function parseXMLwithEmpty(
  param: string,
  explicitChildrenWithOrder: boolean = false
): Promise<any> {
  const xmlParser = new xml2js.Parser({
    explicitArray: false,
    explicitCharkey: false,
    explicitRoot: false,
    preserveChildrenOrder: explicitChildrenWithOrder,
    explicitChildren: explicitChildrenWithOrder
  });
  return new Promise((resolve, reject) => {
    xmlParser.parseString(param, (err?: Error, res?: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}
