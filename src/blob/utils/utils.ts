import { createHash } from "crypto";
import { createWriteStream, PathLike } from "fs";

// TODO: Implement ETag
export function newEtag(): string {
  return `"${new Date().getTime()}"`;
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
      .on("data", hash.update)
      .on("end", () => {
        resolve(hash.digest());
      })
      .on("error", reject);
  });
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

  if (parts.length > 1) {
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
export function deserializePageBlobRangeHeader(
  rangeHeaderValue?: string,
  xMsRangeHeaderValue?: string
): [number, number] {
  const ranges = deserializeRangeHeader(rangeHeaderValue, xMsRangeHeaderValue);
  const startInclusive = ranges[0];
  const endInclusive = ranges[1];

  if (startInclusive % 512 !== 0) {
    throw new RangeError(
      `deserializePageBlobRangeHeader: range start value ${startInclusive} doesn't align with 512 boundary.`
    );
  }

  if (endInclusive !== Infinity && (endInclusive + 1) % 512 !== 0) {
    throw new RangeError(
      `deserializePageBlobRangeHeader: range end value ${endInclusive} doesn't align with 512 boundary.`
    );
  }

  return [startInclusive, endInclusive];
}
