import { isTokenCredential } from "@azure/core-auth";
import {
  CpkInfo,
  DataLakeFileClient,
  DataLakeFileSystemClient
} from "@azure/storage-file-datalake";
import assert from "assert";
import { StorageServiceClient } from "azure-storage";
import { randomBytes } from "crypto";
import * as fs from "fs";
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
  length: number = response.contentLength!
): Promise<string> {
  if (response.contentLength === 0) {
    return "";
  }

  return new Promise<string>((resolve, reject) => {
    response.readableStreamBody!.on("readable", () => {
      let chunk;
      let result: string | undefined;
      while ((chunk = response.readableStreamBody!.read(length))) {
        result = result ? result + chunk.toString() : chunk.toString();
      }
      if (result) {
        resolve(result.toString());
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
    const ws = fs.createWriteStream(destFile);
    let offsetInMB = 0;

    function randomValueHex(len = blockSize) {
      return randomBytes(Math.ceil(len / 2))
        .toString("hex") // convert to hexadecimal format
        .slice(0, len); // return required number of characters
    }

    ws.on("open", () => {
      // tslint:disable-next-line:no-empty
      while (offsetInMB++ < blockNumber && ws.write(randomValueHex())) {
        //
      }
      if (offsetInMB >= blockNumber) {
        ws.end();
      }
    });

    ws.on("drain", () => {
      // tslint:disable-next-line:no-empty
      while (offsetInMB++ < blockNumber && ws.write(randomValueHex())) {
        //
      }
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
    const ws = fs.createWriteStream(file);
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
  tid: string
) {
  const privateKey = fs.readFileSync("./tests/server.key");
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
    (service as any).__proto__.__proto__._buildRequestOptions = (
      service as any
    ).__proto__.__proto__.__original_buildRequestOptions;
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
    (service as any).__proto__.__proto__.__original_buildRequestOptions =
      original;
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

export function getEncryptionScope(): string {
  // return "ENCRYPTION_SCOPE";
  throw new Error("encryption scope not implemented yet.");
}

export function getYieldedValue<YT, RT>(
  iteratorResult: IteratorResult<YT, RT>
): YT {
  if (iteratorResult.done) {
    assert.fail(`Expected an item but did not get any`);
  }
  return iteratorResult.value;
}

export const Test_CPK_INFO: CpkInfo = {
  encryptionKey: "MDEyMzQ1NjcwMTIzNDU2NzAxMjM0NTY3MDEyMzQ1Njc=", // [SuppressMessage("Microsoft.Security", "CS001:SecretInline", Justification="This is a fake secret")]
  encryptionKeySha256: "3QFFFpRA5+XANHqwwbT4yXDmrT/2JaLt/FKHjzhOdoE=" // [SuppressMessage("Microsoft.Security", "CS001:SecretInline", Justification="This is a fake secret")]
};

export function assertClientUsesTokenCredential(
  client: DataLakeFileSystemClient
): void {
  assert.ok(isTokenCredential(client.credential));
}

/**
 * ONLY AVAILABLE IN NODE.JS RUNTIME.
 *
 * Writes the content of a readstream to a local file. Returns a Promise which is completed after the file handle is closed.
 * If Promise is rejected, the reason will be set to the first error raised by either the
 * ReadableStream or the fs.WriteStream.
 *
 * @param rs - The read stream.
 * @param file - Destination file path.
 */
export async function readStreamToLocalFileWithLogs(
  rs: NodeJS.ReadableStream,
  file: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(file);

    // Set STREAM_DEBUG env var to log stream events while running tests
    // if (process.env.STREAM_DEBUG) {
    rs.on("close", () => console.log("rs.close"));
    rs.on("data", () => console.log("rs.data"));
    rs.on("end", () => console.log("rs.end"));
    rs.on("error", () => console.log("rs.error"));

    ws.on("close", () => console.log("ws.close"));
    ws.on("drain", () => console.log("ws.drain"));
    ws.on("error", () => console.log("ws.error"));
    ws.on("finish", () => console.log("ws.finish"));
    ws.on("pipe", () => console.log("ws.pipe"));
    ws.on("unpipe", () => console.log("ws.unpipe"));
    // }

    let error: Error;

    rs.on("error", (err: Error) => {
      // First error wins
      if (!error) {
        error = err;
      }

      // When rs.error is raised, rs.end will never be raised automatically, so it must be raised manually
      // to ensure ws.close is eventually raised.
      rs.emit("end");
    });

    ws.on("error", (err: Error) => {
      // First error wins
      if (!error) {
        error = err;
      }
    });

    ws.on("close", () => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });

    rs.pipe(ws);
  });
}

/**
 * Reads a readable stream into buffer entirely.
 *
 * @param stream - A Node.js Readable stream
 * @param buffer - Buffer to be filled, length must greater than or equal to offset
 * @param encoding - Encoding of the Readable stream
 * @returns with the count of bytes read.
 * @throws `RangeError` If buffer size is not big enough.
 */
export async function streamToBuffer2(
  stream: NodeJS.ReadableStream,
  buffer: Buffer,
  encoding?: BufferEncoding
): Promise<number> {
  let pos = 0; // Position in stream
  const bufferSize = buffer.length;

  return new Promise<number>((resolve, reject) => {
    stream.on("readable", () => {
      let chunk = stream.read();
      if (!chunk) {
        return;
      }
      if (typeof chunk === "string") {
        chunk = Buffer.from(chunk, encoding);
      }

      if (pos + chunk.length > bufferSize) {
        reject(
          new Error(`Stream exceeds buffer size. Buffer size: ${bufferSize}`)
        );
        return;
      }

      buffer.fill(chunk, pos, pos + chunk.length);
      pos += chunk.length;
      console.log(pos);
      if (pos > bufferSize - 65 * 1024) {
        console.log(pos);
      }
    });

    stream.on("end", () => {
      resolve(pos);
    });

    stream.on("close", () => {
      resolve(pos);
    });

    stream.on("error", reject);
  });
}

export async function upload(
  fileClient: DataLakeFileClient,
  data: string,
  metadata: any = undefined
) {
  let uploadResult = await (metadata
    ? fileClient.create(metadata)
    : fileClient.create());
  assert.ok(uploadResult.requestId);
  uploadResult = await fileClient.append(data, 0, data.length);
  assert.ok(uploadResult.requestId);
  uploadResult = await fileClient.flush(data.length);
  assert.ok(uploadResult.requestId);
}
