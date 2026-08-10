import { createHash, createHmac, randomInt } from "crypto";
import { promises as fsPromises } from "fs";
import { parse } from "url";
import StorageErrorFactory from "../../blob/errors/StorageErrorFactory";
import { VALID_CSHARP_IDENTIFIER_REGEX } from "./constants";

// LokiFsStructuredAdapter
// tslint:disable-next-line:no-var-requires
export const lfsa = require("lokijs/src/loki-fs-structured-adapter.js");

/**
 * Recursively and forcefully removes the file or directory at `path`,
 * using Node.js's built-in `fs.promises.rm()`. This replaces the previous
 * `rimraf` dependency; on Windows it retries a few times to work around
 * transient file locks.
 *
 * @param path Absolute or relative path to remove.
 */
export async function rimrafAsync(path: string): Promise<void> {
  await fsPromises.rm(path, {
    recursive: true,
    force: true,
    maxRetries: process.platform === "win32" ? 10 : 0
  });
}

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
  rawHeaders: string[] = [],
  contextId: string = ""
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
    (new Date().getTime() * randomInt(70000, 100001))
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
  return createHmac("sha256", new Uint8Array(key))
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
  return new Uint8Array(createHash("md5").update(text).digest());
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
        resolve(new Uint8Array(hash.digest()));
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

// CRC-64/NVME implementation for Azure Storage transactional integrity checks.
// This is the variant the Azure Blob service uses on x-ms-content-crc64; the
// wire format is little-endian (LSB byte first).
//
// Parameters:
//   width  = 64
//   poly   = 0xad93d23594c93659  (reflected form: 0x9a6c9329ac4bc9b5)
//   init   = 0xffffffffffffffff
//   refin  = true
//   refout = true
//   xorout = 0xffffffffffffffff
//   check  = 0xae8b14860a799888  ("123456789")
//
// Represented as two 32-bit halves (hi, lo) rather than a 64-bit BigInt, since
// bitwise table-driven CRC updates only need 32-bit `>>>`/`^` operations and
// this avoids BigInt's boxing/allocation overhead on the per-byte hot path.
// Since this is a reflected (right-shift) CRC, `lo` holds the bits that get
// consumed by the next input byte.
const CRC64_POLY_HI = 0x9a6c9329;
const CRC64_POLY_LO = 0xac4bc9b5;

// Flat table: entry i occupies [i*2] (hi) and [i*2+1] (lo).
const CRC64_TABLE: readonly number[] = (() => {
  const table: number[] = new Array(512);
  for (let i = 0; i < 256; i++) {
    let hi = 0;
    let lo = i;
    for (let j = 0; j < 8; j++) {
      const xorPoly = (lo & 1) !== 0;
      const newLo = ((hi & 1) << 31) | (lo >>> 1);
      const newHi = hi >>> 1;
      if (xorPoly) {
        hi = (newHi ^ CRC64_POLY_HI) >>> 0;
        lo = (newLo ^ CRC64_POLY_LO) >>> 0;
      } else {
        hi = newHi >>> 0;
        lo = newLo >>> 0;
      }
    }
    table[i * 2] = hi;
    table[i * 2 + 1] = lo;
  }
  return table;
})();

// Initial CRC state is 0 XOR 0xFFFFFFFFFFFFFFFF = 0xFFFFFFFF_FFFFFFFF.
const CRC64_INIT_HI = 0xffffffff;
const CRC64_INIT_LO = 0xffffffff;

/**
 * Stateful CRC-64/NVME hasher that mirrors the shape of Node's `crypto.Hash`
 * (`update(chunk)` per chunk, then `digest()` once at the end) so stream
 * handlers can treat MD5 and CRC64 uniformly. Like `Hash.update`, `update`
 * accepts a string or Buffer/byte array and converts internally, so callers
 * don't special-case chunk types or thread `[hi, lo]` state by hand.
 */
class CRC64Hash {
  // Represented as two 32-bit halves rather than BigInt (see header note above).
  private hi = CRC64_INIT_HI;
  private lo = CRC64_INIT_LO;

  public update(chunk: string | ArrayLike<number>): this {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    for (let i = 0; i < bytes.length; i++) {
      const index = (this.lo ^ bytes[i]) & 0xff;
      const tHi = CRC64_TABLE[index * 2];
      const tLo = CRC64_TABLE[index * 2 + 1];
      const newLo = ((this.hi & 0xff) << 24) | (this.lo >>> 8);
      const newHi = this.hi >>> 8;
      this.hi = (newHi ^ tHi) >>> 0;
      this.lo = (newLo ^ tLo) >>> 0;
    }
    return this;
  }

  public digest(): Uint8Array {
    // Apply xorout (0xFFFFFFFFFFFFFFFF) and serialize little-endian: LSB first.
    const result = new Uint8Array(8);
    const view = new DataView(result.buffer);
    view.setUint32(0, (this.lo ^ 0xffffffff) >>> 0, true);
    view.setUint32(4, (this.hi ^ 0xffffffff) >>> 0, true);
    return result;
  }
}

export function getCRC64FromString(text: string): Uint8Array {
  return new CRC64Hash().update(text).digest();
}

export async function getCRC64FromStream(
  stream: NodeJS.ReadableStream
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const crc = new CRC64Hash();
    stream
      .on("data", (chunk) => {
        crc.update(chunk);
      })
      .on("end", () => {
        resolve(crc.digest());
      })
      .on("error", reject);
  });
}

/**
 * Computes MD5 and/or CRC-64/NVME in a single stream pass. A checksum is
 * computed when the corresponding `expected` value is provided OR when `force`
 * is set for that field. The other is returned as undefined.
 *
 * `expected` is the caller's request-supplied value (only its presence matters
 * here; comparison happens at the caller). `force` is for callers that need a
 * checksum for purposes other than validation - e.g. Put Blob always needs MD5
 * because it's persisted as the blob's contentMD5 property.
 */
export async function computeTransactionalChecksums(
  stream: NodeJS.ReadableStream,
  expected: { md5?: Uint8Array | string; crc64?: Uint8Array | string },
  force?: { md5?: boolean; crc64?: boolean }
): Promise<{ md5?: Uint8Array; crc64?: Uint8Array }> {
  const needMd5 = expected.md5 !== undefined || !!force?.md5;
  const needCrc64 = expected.crc64 !== undefined || !!force?.crc64;
  const hash = needMd5 ? createHash("md5") : undefined;
  const crc = needCrc64 ? new CRC64Hash() : undefined;
  return new Promise((resolve, reject) => {
    stream
      .on("data", (chunk) => {
        if (hash) hash.update(chunk);
        if (crc) crc.update(chunk);
      })
      .on("end", () => {
        resolve({
          md5: hash ? new Uint8Array(hash.digest()) : undefined,
          crc64: crc ? crc.digest() : undefined
        });
      })
      .on("error", reject);
  });
}
