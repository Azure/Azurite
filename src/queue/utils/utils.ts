import { randomBytes } from "crypto";

import * as xml2js from "xml2js";
import StorageErrorFactory from "../errors/StorageErrorFactory";

export function checkApiVersion(
  inputApiVersion: string,
  validApiVersions: Array<string>,
  requestId: string
): void {
  if (!validApiVersions.includes(inputApiVersion)) {
    throw StorageErrorFactory.getInvalidAPIVersion(requestId, inputApiVersion);
  }
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
 * Retrieve the value from XML body without ignoring the empty characters.
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
