import { randomBytes } from "crypto";
import { createWriteStream } from "fs";
import { join } from "path";
import rimraf from "rimraf";
import { URL } from "url";

import LokiBlobConfiguration from "../src/blob/LokiBlobConfiguration";
import SqlBlobConfiguration from "../src/blob/SqlBlobConfiguration";
import { StoreDestinationArray } from "../src/common/persistence/IExtentStore";

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
  if (String.prototype.padStart) {
    return currentString.padStart(targetLength, padString);
  }

  padString = padString || " ";
  if (currentString.length > targetLength) {
    return currentString;
  } else {
    targetLength = targetLength - currentString.length;
    if (targetLength > padString.length) {
      padString += padString.repeat(targetLength / padString.length);
    }
    return padString.slice(0, targetLength) + currentString;
  }
}

export async function rmRecursive(path: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    rimraf(path, err => {
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
  return new Promise<void>(resolve => {
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
        .slice(0, len); // return required number of characters
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

export class ServerConfigFactory {
  static host = "127.0.0.1";
  static port = 11000;
  static persistenceArray: StoreDestinationArray = [
    {
      persistenceId: "test",
      persistencePath: "__testspersistence__",
      maxConcurrency: 10
    }
  ];
  static dbPath = "__testsstorage__";
  static extentdbPath = "__testsextentstorage__";

  static DEFUALT_SQL_URI =
    "mariadb://root:my-secret-pw@127.0.0.1:3306/azurite_extent_metadata";
  static DEFUALT_SQL_OPTIONS = {
    logging: false,
    pool: {
      max: 100,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      timezone: "Etc/GMT-0"
    }
  };

  public static getLoki(): LokiBlobConfiguration {
    const config = new LokiBlobConfiguration(
      this.host,
      this.port,
      this.dbPath,
      this.extentdbPath,
      this.persistenceArray,
      false
    );
    return config;
  }

  public static getSql(): SqlBlobConfiguration {
    const config = new SqlBlobConfiguration(
      this.host,
      this.port,
      this.DEFUALT_SQL_URI,
      this.DEFUALT_SQL_OPTIONS,
      this.dbPath,
      this.persistenceArray,
      false
    );
    return config;
  }
}

export function rmTestFile(config: LokiBlobConfiguration): Promise<void>;
export function rmTestFile(config: SqlBlobConfiguration): Promise<void>;

export async function rmTestFile(config: any) {
  await rmRecursive(config.blobDBPath);
  if (config instanceof LokiBlobConfiguration) {
    await rmRecursive(config.extentDBPath);
  }
  for (const persistence of config.persistenceArray) {
    await rmRecursive(persistence.persistencePath);
  }
}
