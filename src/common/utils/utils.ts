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

// CRC-64/ECMA-182 implementation for Azure Storage transactional integrity checks.
// Algorithm and lookup-table approach adapted from the Azure Storage JavaScript SDK (MIT License):
// https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/storage/storage-blob/src/utils/crc64.ts
// Polynomial: 0x42F0E1EBA9EA3693 (ECMA-182 standard, unreflected, init=0, xorout=0)
const CRC64_POLY = 0x42f0e1eba9ea3693n;

const CRC64_TABLE: readonly bigint[] = (() => {
  const table: bigint[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = BigInt(i) << 56n;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000000000000000n) !== 0n) {
        crc = ((crc << 1n) ^ CRC64_POLY) & 0xffffffffffffffffn;
      } else {
        crc = (crc << 1n) & 0xffffffffffffffffn;
      }
    }
    table[i] = crc;
  }
  return table;
})();

function crc64Accumulate(crc: bigint, chunk: Uint8Array): bigint {
  for (let i = 0; i < chunk.length; i++) {
    const index = Number((crc >> 56n) ^ BigInt(chunk[i])) & 0xff;
    crc = ((crc << 8n) ^ CRC64_TABLE[index]) & 0xffffffffffffffffn;
  }
  return crc;
}

function bigintToUint8Array(n: bigint): Uint8Array {
  const buf = Buffer.allocUnsafe(8);
  buf.writeUInt32BE(Number(n >> 32n) >>> 0, 0);
  buf.writeUInt32BE(Number(n & 0xffffffffn) >>> 0, 4);
  return buf;
}

export function getCRC64FromString(text: string): Uint8Array {
  return bigintToUint8Array(crc64Accumulate(0n, Buffer.from(text)));
}

export async function getCRC64FromStream(
  stream: NodeJS.ReadableStream
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    let crc = 0n;
    stream
      .on("data", (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
        crc = crc64Accumulate(crc, data);
      })
      .on("end", () => {
        resolve(bigintToUint8Array(crc));
      })
      .on("error", reject);
  });
}

/**
 * Computes MD5 and CRC-64/ECMA-182 in a single stream pass, avoiding
 * reading the extent twice when both checksums may be needed.
 */
export async function computeTransactionalChecksums(
  stream: NodeJS.ReadableStream
): Promise<{ md5: Uint8Array; crc64: Uint8Array }> {
  const hash = createHash("md5");
  return new Promise((resolve, reject) => {
    let crc = 0n;
    stream
      .on("data", (chunk: Buffer | string) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
        hash.update(data);
        crc = crc64Accumulate(crc, data);
      })
      .on("end", () => {
        resolve({ md5: hash.digest(), crc64: bigintToUint8Array(crc) });
      })
      .on("error", reject);
  });
}
