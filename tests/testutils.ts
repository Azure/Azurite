import { StorageServiceClient } from "azure-storage";
import { randomBytes } from "crypto";
import { createWriteStream, readFileSync } from "fs";
import { sign } from "jsonwebtoken";
import { join } from "path";
import rimraf from "rimraf";
import { URL } from "url";

export const EMULATOR_ACCOUNT_NAME = "devstoreaccount1";
export const EMULATOR_ACCOUNT_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

export function getUniqueName(prefix: string): string {
  return `${prefix}${new Date().getTime()}${padStart(
    Math.floor(Math.random() * 10000).toString(),
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
