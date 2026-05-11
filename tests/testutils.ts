import { StorageServiceClient } from "azure-storage";
import { randomBytes } from "crypto";
import { createWriteStream, readFileSync } from "fs";
import { sign } from "jsonwebtoken";
import { join } from "path";
import rimraf from "rimraf";
import { URL } from "url";

// ---- Live Azure mode -------------------------------------------------------
//
// Why this exists:
//   Azurite is meant to emulate the real Azure Blob service. Tests assert on
//   error codes (Md5Mismatch, Crc64Mismatch, BothCrc64AndMd5HeaderPresent,
//   InvalidMd5, InvalidHeaderValue, ...), checksum byte order, response-echo
//   fields, etc. — and many of these expectations were originally taken from
//   either documentation or "what makes sense", which is how Azurite ended up
//   with subtle drifts from the real service (wrong CRC64 variant, big-endian
//   bytes vs little-endian, generic InvalidOperation in place of typed
//   Md5Mismatch, etc.).
//
//   Routing the *same* test through real Azure is the only practical way to
//   pin assertions to real-service behavior. When a test like
//   `stageBlock with wrong body should throw md5 mismatch` passes both against
//   the local Azurite server and against a real Azure account, the assertion
//   is a verified statement about the service contract — not an Azurite-only
//   convention. If a test only passes against Azurite, we know it's drift.
//
// How it works:
//   Set AZURITE_LIVE_TEST_CONNECTION_STRING to a full storage account
//   connection string. The harness then:
//     - has `BlobTestServerFactory.createServer()` return a no-op stub
//       (no local server starts/stops/cleans),
//     - swaps `EMULATOR_ACCOUNT_NAME` / `EMULATOR_ACCOUNT_KEY` to the live
//       account's credentials,
//     - has `getTestServerBaseURL(server)` produce
//       `https://<account>.blob.core.windows.net` (no `/devstoreaccount1`).
//   Tests that build their service client via these symbols therefore work
//   against either backend without any per-test branching.
//
// Per-test files build their service-client base URL via `getTestServerBaseURL`
// (rather than the inline `http://host:port/devstoreaccount1` template),
// which routes correctly in both modes.

function parseLiveConnectionString(cs: string): {
  accountName: string;
  accountKey: string;
  blobEndpoint: string;
} {
  const parts = new Map<string, string>();
  for (const segment of cs.split(";")) {
    const eq = segment.indexOf("=");
    if (eq > 0) parts.set(segment.slice(0, eq).trim(), segment.slice(eq + 1).trim());
  }
  const accountName = parts.get("AccountName");
  const accountKey = parts.get("AccountKey");
  const protocol = parts.get("DefaultEndpointsProtocol") || "https";
  const suffix = parts.get("EndpointSuffix") || "core.windows.net";
  if (!accountName || !accountKey) {
    throw new Error(
      "AZURITE_LIVE_TEST_CONNECTION_STRING is missing AccountName or AccountKey."
    );
  }
  const blobEndpoint = (parts.get("BlobEndpoint") ||
    `${protocol}://${accountName}.blob.${suffix}`).replace(/\/$/, "");
  return { accountName, accountKey, blobEndpoint };
}

const liveConnectionString = process.env.AZURITE_LIVE_TEST_CONNECTION_STRING || undefined;

export const LIVE_TEST_MODE = liveConnectionString !== undefined;

const liveConfig = liveConnectionString
  ? parseLiveConnectionString(liveConnectionString)
  : undefined;

export const EMULATOR_ACCOUNT_NAME =
  liveConfig?.accountName ?? "devstoreaccount1";
export const EMULATOR_ACCOUNT_KEY =
  liveConfig?.accountKey ??
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

/**
 * Builds the blob service base URL for a test fixture. In emulator mode this
 * is `http://<host>:<port>/devstoreaccount1`; in live mode it's the real
 * account's blob endpoint (e.g. `https://<account>.blob.core.windows.net`).
 *
 * Pass `https: true` for the few tests that explicitly need HTTPS against the
 * emulator (oauth/https tests); ignored in live mode where HTTPS is always used.
 */
export function getTestServerBaseURL(
  server: { config: { host: string; port: number } },
  options: { https?: boolean; accountPathSuffix?: string } = {}
): string {
  if (liveConfig) {
    return options.accountPathSuffix
      ? `${liveConfig.blobEndpoint}${options.accountPathSuffix}`
      : liveConfig.blobEndpoint;
  }
  const protocol = options.https ? "https" : "http";
  const suffix = options.accountPathSuffix ?? "/devstoreaccount1";
  return `${protocol}://${server.config.host}:${server.config.port}${suffix}`;
}

// Counter-based suffix instead of Math.random() to guarantee uniqueness within
// a test run. Random suffixes can collide when multiple entities are created
// within the same millisecond on fast CI runners, causing flaky batch tests.
let _uniqueNameCounter = 0;

export function getUniqueName(prefix: string): string {
  return `${prefix}${new Date().getTime()}${padStart(
    (++_uniqueNameCounter).toString(),
    5,
    "00000"
  )}`;
}

/**
 * String.prototype.padStart()
 *
 * @export
 * @param {string} currentString
 * @param {number} targetLength
 * @param {string} [padString=" "]
 * @returns {string}
 */
export function padStart(
  currentString: string,
  targetLength: number,
  padString: string = " "
): string {
  // if (String.prototype.padStart) {
  return currentString.padStart(targetLength, padString);
  // }

  // padString = padString || " ";
  // if (currentString.length > targetLength) {
  //   return currentString;
  // } else {
  //   targetLength = targetLength - currentString.length;
  //   if (targetLength > padString.length) {
  //     padString += padString.repeat(targetLength / padString.length);
  //   }
  //   return padString.slice(0, targetLength) + currentString;
  // }
}

export async function rmRecursive(path: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    rimraf(path, (err) => {
      if (err) {
        resolve();
        // TODO: Handle delete errors
        // reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Read body from downloading operation methods to string.
 * Work on both Node.js and browser environment.
 *
 * @param response Convenience layer methods response with downloaded body
 * @param length Length of Readable stream, needed for Node.js environment
 */
export async function bodyToString(
  response: {
    readableStreamBody?: NodeJS.ReadableStream;
    blobBody?: Promise<Blob>;
    contentLength?: number;
  },
  length?: number
): Promise<string> {
  if (response.contentLength === 0) {
    return "";
  }

  return new Promise<string>((resolve, reject) => {
    response.readableStreamBody!.on("readable", () => {
      let chunk;
      chunk = response.readableStreamBody!.read(length);
      if (chunk) {
        resolve(chunk.toString());
      }
    });

    response.readableStreamBody!.on("error", reject);
  });
}

export async function sleep(time: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, time);
  });
}

export function base64encode(content: string): string {
  return Buffer.from(content).toString("base64");
}

/**
 * Append a string to URL path. Will remove duplicated "/" in front of the string
 * when URL path ends with a "/".
 *
 * @export
 * @param {string} url Source URL string
 * @param {string} name String to be appended to URL
 * @returns {string} An updated URL string
 */
export function appendToURLPath(url: string, name: string): string {
  const urlParsed = new URL(url);

  let path = urlParsed.pathname;
  path = path
    ? path.endsWith("/")
      ? `${path}${name}`
      : `${path}/${name}`
    : name;
  urlParsed.pathname = path;

  return urlParsed.href;
}

export async function createRandomLocalFile(
  folder: string,
  blockNumber: number,
  blockSize: number
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const destFile = join(folder, getUniqueName("tempfile."));
    const ws = createWriteStream(destFile);
    let offsetInMB = 0;

    function randomValueHex(len = blockSize) {
      return randomBytes(Math.ceil(len / 2))
        .toString("hex") // convert to hexadecimal format
        .slice(0, len - (len > 1 ? 1 : 0)) + (len > 1 ? "\n" : ""); // append newlines to make debugging easier
    }

    ws.on("open", () => {
      // tslint:disable-next-line:no-empty
      while (offsetInMB++ < blockNumber && ws.write(randomValueHex())) {}
      if (offsetInMB >= blockNumber) {
        ws.end();
      }
    });

    ws.on("drain", () => {
      // tslint:disable-next-line:no-empty
      while (offsetInMB++ < blockNumber && ws.write(randomValueHex())) {}
      if (offsetInMB >= blockNumber) {
        ws.end();
      }
    });
    ws.on("finish", () => resolve(destFile));
    ws.on("error", reject);
  });
}

export async function readStreamToLocalFile(
  rs: NodeJS.ReadableStream,
  file: string
) {
  return new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(file);
    rs.pipe(ws);
    rs.on("error", reject);
    ws.on("error", reject);
    ws.on("finish", resolve);
  });
}

export function generateJWTToken(
  nbf: Date,
  iat: Date,
  exp: Date,
  iss: string,
  aud: string,
  scp: string,
  oid: string,
  tid: string,
) {
  const privateKey = readFileSync("./tests/server.key");
  const token = sign(
    {
      nbf: Math.floor(nbf.getTime() / 1000),
      iat: Math.floor(iat.getTime() / 1000),
      exp: Math.floor(exp.getTime() / 1000),
      iss,
      aud,
      scp,
      oid,
      tid
    },
    privateKey,
    { algorithm: "RS256" }
  );
  return token;
}

export function restoreBuildRequestOptions(service: any) {
  if ((service as any).__proto__.__proto__.__original_buildRequestOptions) {
    // tslint:disable-next-line: max-line-length
    (service as any).__proto__.__proto__._buildRequestOptions = (service as any).__proto__.__proto__.__original_buildRequestOptions;
  }
}
export function overrideRequest(
  override: {
    headers: { [key: string]: string };
  } = { headers: {} },
  service: StorageServiceClient
) {
  const hasOriginal = !!(service as any).__proto__.__proto__
    .__original_buildRequestOptions;

  const original = hasOriginal
    ? (service as any).__proto__.__proto__.__original_buildRequestOptions
    : (service as any).__proto__.__proto__._buildRequestOptions;

  if (!hasOriginal) {
    (service as any).__proto__.__proto__.__original_buildRequestOptions = original;
  }

  const _buildRequestOptions = original.bind(service);
  (service as any).__proto__.__proto__._buildRequestOptions = (
    webResource: any,
    body: any,
    options: any,
    callback: any
  ) => {
    _buildRequestOptions(
      webResource,
      body,
      options,
      (err: any, finalRequestOptions: any) => {
        for (const key in override.headers) {
          if (Object.prototype.hasOwnProperty.call(override.headers, key)) {
            const element = override.headers[key];
            finalRequestOptions.headers[key] = element;
          }
        }

        callback(err, finalRequestOptions);
      }
    );
  };
}
