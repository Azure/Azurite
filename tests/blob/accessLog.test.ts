import * as assert from "assert";
import * as net from "net";
import { Writable } from "stream";

import BlobConfiguration from "../../src/blob/BlobConfiguration";
import BlobServer from "../../src/blob/BlobServer";
import { DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT } from "../../src/blob/utils/constants";
import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import { rmRecursive } from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Blob access log @loki", () => {
  const host = "127.0.0.1";
  const metadataDBPath = "__test_db_blob_accesslog__.json";
  const extentDBPath = "__test_db_blob_accesslog_extent__.json";
  const persistencePath = "__test_blob_accesslog_extent__";
  const persistenceArray: StoreDestinationArray = [
    {
      locationId: "test",
      locationPath: persistencePath,
      maxConcurrency: 10
    }
  ];

  let accessLogLines: string[] = [];
  const accessLogWriteStream = new Writable({
    write(chunk, _encoding, callback): void {
      accessLogLines.push(chunk.toString());
      callback();
    }
  });

  const config = new BlobConfiguration(
    host,
    0,
    DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
    metadataDBPath,
    extentDBPath,
    persistenceArray,
    true,
    accessLogWriteStream
  );
  const server = new BlobServer(config);

  let port: number;

  /**
   * Sends a raw HTTP request, so request targets and headers which cannot be
   * expressed with a HTTP client (like a literal double quote) can be used.
   */
  async function sendRawRequest(rawRequest: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = net.connect(port, host, () => {
        socket.write(rawRequest);
      });
      socket.on("error", reject);
      socket.on("close", () => resolve());
      socket.resume();
    });
  }

  async function waitForAccessLogLine(): Promise<string> {
    for (let i = 0; i < 100 && accessLogLines.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.strictEqual(
      accessLogLines.length,
      1,
      `Expected exactly one access log record, got ${accessLogLines.length}`
    );
    return accessLogLines[0];
  }

  before(async () => {
    await server.start();
    const address = server.getHttpServerAddress();
    port = parseInt(address.substring(address.lastIndexOf(":") + 1), 10);
  });

  beforeEach(() => {
    accessLogLines = [];
  });

  after(async () => {
    await server.close();
    await server.clean();
    await rmRecursive(metadataDBPath);
    await rmRecursive(extentDBPath);
    await rmRecursive(persistencePath);
  });

  it("should write one common format access log record per request @loki", async () => {
    await sendRawRequest(
      `GET /devstoreaccount1?comp=list HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\n\r\n`
    );

    const logRecord = await waitForAccessLogLine();
    assert.ok(
      logRecord.endsWith("\n") && logRecord.indexOf("\n") === logRecord.length - 1,
      `Access log record should be a single line: ${JSON.stringify(logRecord)}`
    );
    assert.ok(
      /^127\.0\.0\.1 - - \[[^\]]+\] "GET \/devstoreaccount1\?comp=list HTTP\/1\.1" \d{3} /.test(
        logRecord
      ),
      `Access log record doesn't match the common log format: ${JSON.stringify(
        logRecord
      )}`
    );
  });

  it("should escape double quotes coming from the request target @loki", async () => {
    await sendRawRequest(
      `GET /devstoreaccount1/container"200"-"forged HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\n\r\n`
    );

    const logRecord = await waitForAccessLogLine();
    assert.ok(
      logRecord.includes(
        '/devstoreaccount1/container\\"200\\"-\\"forged HTTP/1.1'
      ),
      `Double quote from the request target should be escaped: ${JSON.stringify(
        logRecord
      )}`
    );
    assert.strictEqual(
      countUnescapedDoubleQuotes(logRecord),
      2,
      `Only the request line delimiters should be unescaped double quotes: ${JSON.stringify(
        logRecord
      )}`
    );
  });
});

/**
 * Counts the double quotes which are not preceded by a backslash, those are the
 * field delimiters a log consumer parses the record by.
 */
function countUnescapedDoubleQuotes(logRecord: string): number {
  let count = 0;
  for (let i = 0; i < logRecord.length; i++) {
    if (logRecord[i] === "\\") {
      i++;
      continue;
    }
    if (logRecord[i] === '"') {
      count++;
    }
  }
  return count;
}
