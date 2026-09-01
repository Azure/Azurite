import * as assert from "assert";
import express from "express";
import * as http from "http";
import { AddressInfo } from "net";
import { Writable } from "stream";

import morgan = require("morgan");

/**
 * Azurite writes one access log line per request through the morgan "common"
 * format, see BlobRequestListenerFactory, QueueRequestListenerFactory and
 * TableRequestListenerFactory. These tests validate that attacker controlled
 * token values cannot forge additional log records.
 */
describe("Access log middleware @loki", () => {
  let server: http.Server;
  let logLines: string[];

  beforeEach((done) => {
    logLines = [];

    const stream = new Writable({
      write(chunk, _encoding, callback): void {
        logLines.push(chunk.toString());
        callback();
      }
    });

    const app = express().disable("x-powered-by");
    app.use(morgan("common", { stream }));
    app.use((_req, res) => {
      res.status(200).send("ok");
    });

    server = http.createServer(app);
    server.listen(0, done);
  });

  afterEach((done) => {
    server.close(() => done());
  });

  const request = async (
    path: string,
    headers: http.OutgoingHttpHeaders = {}
  ): Promise<void> => {
    const port = (server.address() as AddressInfo).port;
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path, method: "GET", headers },
        (res) => {
          res.resume();
          res.on("end", () => setImmediate(resolve));
          res.on("error", reject);
        }
      );
      req.on("error", reject);
      req.end();
    });
  };

  const basicAuthHeader = (user: string): string =>
    `Basic ${Buffer.from(`${user}:password`, "utf8").toString("base64")}`;

  it("writes one access log line per request @loki", async () => {
    await request("/devstoreaccount1/container?comp=list");

    assert.strictEqual(logLines.length, 1);
    assert.strictEqual(logLines[0].split("\n").length, 2); // trailing newline only
    assert.ok(
      logLines[0].includes('"GET /devstoreaccount1/container?comp=list HTTP/1.1" 200'),
      `Unexpected access log line: ${logLines[0]}`
    );
  });

  it("escapes Unicode line separators in the remote user token @loki", async () => {
    // U+2028, U+2029 and U+0085 are treated as line terminators by many log
    // parsers and were only escaped starting with morgan 1.12.0.
    const maliciousUser = "victim\u2028injected\u2029line\u0085break";

    await request("/devstoreaccount1/container", {
      authorization: basicAuthHeader(maliciousUser)
    });

    assert.strictEqual(logLines.length, 1);
    const line = logLines[0];
    for (const separator of ["\u2028", "\u2029", "\u0085"]) {
      assert.ok(
        !line.includes(separator),
        `Access log line must not contain raw ${JSON.stringify(
          separator
        )}: ${line}`
      );
    }
    assert.ok(
      line.includes("victim\\u2028injected\\u2029line\\u0085break"),
      `Unexpected access log line: ${line}`
    );
  });

  it("escapes ASCII control characters in the remote user token @loki", async () => {
    const maliciousUser = "victim\r\ninjected";

    await request("/devstoreaccount1/container", {
      authorization: basicAuthHeader(maliciousUser)
    });

    assert.strictEqual(logLines.length, 1);
    const line = logLines[0];
    assert.strictEqual(line.split("\n").length, 2);
    assert.ok(
      line.includes("victim\\r\\ninjected"),
      `Unexpected access log line: ${line}`
    );
  });
});
