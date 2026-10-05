import * as assert from "assert";
import type { AddressInfo } from "net";

import { createPilotServer } from "../../src/queue/typespecPilot/server/createPilotServer";
import { RealQueueHandler } from "../../src/queue/typespecPilot/server/realQueueHandler";

/**
 * This is the real proof-of-concept this repo asked for: a hand-written server layer
 * (`src/queue/typespecPilot/server/{dispatcher,createPilotServer,realQueueHandler}.ts`) that
 * *actually depends on and is driven by* the pilot TypeSpec emitter's generated artifacts
 * (`src/queue/typespecPilot/generated/{models,operations,handlers}.ts`) - generated from the
 * **real, unchanged** Azure Storage Queue TypeSpec plus a real `azurite.tsp` overlay (see
 * `fixture/storage-queue-real/`), not a toy fixture:
 *
 *  - The Express routes are registered purely from the generated `operations` metadata table
 *    (method/path/parameter bindings), plus one small hand-written classification
 *    (`QUEUE_SCOPED_OPERATIONS` in `dispatcher.ts`) documenting a real gap this vendoring
 *    surfaced: the real spec routes `{queueName}` through client initialization, invisible to
 *    this emitter's generated metadata (see that file's comment and the structural test in
 *    `generatedArtifacts.test.ts`).
 *  - `RealQueueHandler` is a hand-written class that `implements` the generated
 *    `IServiceHandler` interface for all 17 real operations - if the generated interface's
 *    method signatures changed incompatibly, this file would fail to compile.
 *  - Response headers sent over real HTTP are derived from the generated per-status
 *    `OperationResponseMetadata` wire-name mapping, not hardcoded.
 *
 * Request/response bodies are exercised as plain JSON over HTTP, not the real spec's declared
 * XML wire format - XML (de)serialization is explicitly out of scope for this pilot (see the
 * top-level README's "what this does NOT cover" section). This still proves the layer that *is*
 * in scope end to end: HTTP request -> generated-metadata-driven dispatch -> hand-written
 * handler logic implementing the real `IServiceHandler` contract -> generated-metadata-driven
 * response shaping -> real HTTP response.
 */
describe("TypeSpec emitter pilot: hand-written server driven by real-spec generated artifacts @loki", () => {
  async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
    const handler = new RealQueueHandler();
    const app = createPilotServer(handler);
    const server = app.listen(0);
    try {
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const { port } = server.address() as AddressInfo;
      return await run(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  }

  // Every real Queue operation marks `x-ms-version` as a required header (see operations.ts), so
  // every request in these tests needs it - this small helper keeps that out of each test body.
  function call(baseUrl: string, path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "x-ms-version": "2025-05-05", ...(init.headers as Record<string, string>) },
    });
  }

  it("PUT (create queue) routes through generated metadata, runs hand-written logic, and returns a real HTTP response", async () => {
    await withServer(async (baseUrl) => {
      const response = await call(baseUrl, "/my-queue", { method: "PUT" });

      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.headers.get("x-ms-version"), "2025-05-05");
    });
  });

  it("disambiguates PUT /{queueName}?comp=metadata (SetMetadata) from PUT /{queueName} (Create), both sharing a path+verb, using only generated route metadata plus the real literal query string", async () => {
    await withServer(async (baseUrl) => {
      await call(baseUrl, "/meta-queue", { method: "PUT" });

      const setMetadata = await call(baseUrl, "/meta-queue?comp=metadata", {
        method: "PUT",
        headers: { "x-ms-meta": "a=b" },
      });
      assert.strictEqual(setMetadata.status, 204);

      const getProperties = await call(baseUrl, "/meta-queue?comp=metadata");
      assert.strictEqual(getProperties.status, 200);
      assert.strictEqual(getProperties.headers.get("x-ms-meta"), "a=b");
      assert.strictEqual(getProperties.headers.get("x-ms-approximate-messages-count"), "0");
    });
  });

  it("GET ?comp=list (GetQueues) and GET ?restype=service&comp=properties (GetProperties) both GET \"/\" but are disambiguated by literal query", async () => {
    await withServer(async (baseUrl) => {
      await call(baseUrl, "/list-queue-a", { method: "PUT" });
      await call(baseUrl, "/list-queue-b", { method: "PUT" });

      const list = await call(baseUrl, "/?comp=list");
      assert.strictEqual(list.status, 200);
      const listBody = (await list.json()) as { queueItems?: { name: string }[] };
      assert.deepStrictEqual(
        (listBody.queueItems ?? []).map((q) => q.name).sort(),
        ["list-queue-a", "list-queue-b"],
      );

      const props = await call(baseUrl, "/?restype=service&comp=properties");
      assert.strictEqual(props.status, 200);
    });
  });

  it("full message lifecycle (send -> receive -> update -> delete) over real HTTP, dispatched purely from generated route/parameter metadata", async () => {
    await withServer(async (baseUrl) => {
      await call(baseUrl, "/msg-queue", { method: "PUT" });

      const sendResponse = await call(baseUrl, "/msg-queue/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageText: "hello" }),
      });
      assert.strictEqual(sendResponse.status, 201);

      // GET /messages (ReceiveMessages) and GET /messages?peekonly=true (PeekMessages) share a
      // path+verb after stripping the literal query - exercise both to prove the dispatcher's
      // literal-query disambiguation handles this real two-way collision.
      const peeked = await call(baseUrl, "/msg-queue/messages?peekonly=true");
      assert.strictEqual(peeked.status, 200);
      const peekedBody = (await peeked.json()) as { items: { messageText: string }[] };
      assert.strictEqual(peekedBody.items.length, 1);
      assert.strictEqual(peekedBody.items[0].messageText, "hello");

      const received = await call(baseUrl, "/msg-queue/messages?numofmessages=1");
      assert.strictEqual(received.status, 200);
      const receivedBody = (await received.json()) as {
        items: { messageId: string; popReceipt: string }[];
      };
      assert.strictEqual(receivedBody.items.length, 1);
      const { messageId, popReceipt } = receivedBody.items[0];

      const updated = await call(
        baseUrl,
        `/msg-queue/messages/${messageId}?popreceipt=${popReceipt}&visibilitytimeout=5`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageText: "updated" }),
        },
      );
      assert.strictEqual(updated.status, 204);
      const newPopReceipt = updated.headers.get("x-ms-popreceipt");
      assert.ok(newPopReceipt, "expected updateMessage to return a new popReceipt header");

      const deleted = await call(
        baseUrl,
        `/msg-queue/messages/${messageId}?popreceipt=${newPopReceipt}`,
        { method: "DELETE" },
      );
      assert.strictEqual(deleted.status, 204);
    });
  });

  it("rejects a request to an unknown route the way a real dispatcher must", async () => {
    await withServer(async (baseUrl) => {
      const response = await call(baseUrl, "/some-queue/not-a-real-operation");
      assert.strictEqual(response.status, 404);
    });
  });
});
