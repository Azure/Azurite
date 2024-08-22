import { createHash, createHmac } from "crypto";
import rimraf = require("rimraf");
import { parse } from "url";
import { promisify } from "util";
import StorageErrorFactory from "../../blob/errors/StorageErrorFactory";
import { VALID_CSHARP_IDENTIFIER_REGEX } from "./constants";

// LokiFsStructuredAdapter
// tslint:disable-next-line:no-var-requires
export const lfsa = require("lokijs/src/loki-fs-structured-adapter.js");

export const rimrafAsync = promisify(rimraf);

export function minDate(date1: Date, date2: Date): Date {
  return date1 > date2 ? date2 : date1;
}

// Blob Snapshot is has 7 digital for Milliseconds, but Datetime has Milliseconds with 3 digital. So need convert.
export function convertDateTimeStringMsTo7Digital(
  dateTimeString: string
): string {
  return dateTimeString.replace("Z", "0000Z");
}

export function convertRawHeadersToMetadata(
  rawHeaders: string[] = [], contextId: string = ""
): { [propertyName: string]: string } | undefined {
  const metadataPrefix = "x-ms-meta-";
  const res: { [propertyName: string]: string } = {};
  let isEmpty = true;

  for (let i = 0; i < rawHeaders.length; i = i + 2) {
    const header = rawHeaders[i];
    if (
      header.toLowerCase().startsWith(metadataPrefix) &&
      header.length > metadataPrefix.length
    ) {
      const key = header.substr(metadataPrefix.length);
      if (!key.match(VALID_CSHARP_IDENTIFIER_REGEX)) {
        throw StorageErrorFactory.getInvalidMetadata(contextId);
      }
      let value = rawHeaders[i + 1] || "";
      if (res[key] !== undefined) {
        value = `${res[key]},${value}`;
      }
      res[key] = value;
      isEmpty = false;
      continue;
    }
  }

  return isEmpty ? undefined : res;
}

export function newEtag(): string {
  // Etag should match ^"0x[A-F0-9]{15,}"$
  // Date().getTime().toString(16) only has 11 digital
  // so multiply a number between 70000-100000, can get a 16 based 15+ digital number
  return (
    '"0x' +
    (new Date().getTime() * Math.round(Math.random() * 30000 + 70000))
      .toString(16)
      .toUpperCase() +
    '"'
  );
}

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
  withMilliseconds: boolean = true,
  hrtimePrecision: boolean = false
): string {
  // Date.toISOString() will return like "2018-10-29T06:34:36.139Z"
  const dateString = date.toISOString();

  // some clients are very fast, and require more than ms precision available in JS
  // This is an approximation based on the hrtime function in nodejs.
  // The nanosecond value is appended to the millisecond value from the datetime
  // object which gives us a good enough difference in the case of faster high
  // volume transactions
  if (hrtimePrecision) {
    return (
      dateString.substring(0, dateString.length - 1) +
      process.hrtime()[1].toString().padStart(4, "0").slice(0, 4) +
      "Z"
    );
  }
  return withMilliseconds
    ? dateString.substring(0, dateString.length - 1) + "0000" + "Z"
    : dateString.substring(0, dateString.length - 5) + "Z";
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

export async function getMD5FromString(text: string): Promise<Uint8Array> {
  return createHash("md5").update(text).digest();
}

export async function getMD5FromStream(
  stream: NodeJS.ReadableStream
): Promise<Uint8Array> {
  const hash = createHash("md5");
  return new Promise<Uint8Array>((resolve, reject) => {
    stream
      .on("data", (data) => {
        hash.update(data);
      })
      .on("end", () => {
        resolve(hash.digest());
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}
