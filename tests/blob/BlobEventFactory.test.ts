import * as assert from "assert";

import Context from "../../src/blob/generated/Context";
import { BlobEventType } from "../../src/blob/events/IBlobEvent";
import { createBlobEvent } from "../../src/blob/events/BlobEventFactory";

// Build a minimal Context whose BlobStorageContext getters return test values,
// with a fake request exposing getUrl()/getHeader().
function makeContext(account: string, container: string, blob?: string): Context {
  const holder: any = {};
  const context = new Context(holder, "context");
  context.contextId = "req-123";
  context.startTime = new Date("2026-08-06T12:34:56.789Z");
  (context as any).context.account = account;
  (context as any).context.container = container;
  (context as any).context.blob = blob;
  context.request = {
    getUrl: () => `http://127.0.0.1:10000/${account}/${container}/${blob ?? ""}`,
    getHeader: (field: string) =>
      field.toLowerCase() === "x-ms-client-request-id" ? "client-abc" : undefined
  } as any;
  return context;
}

describe("BlobEventFactory @loki @sql", () => {
  it("builds a BlobCreated Event Grid envelope", () => {
    const ctx = makeContext("devstoreaccount1", "c1", "path/to/file.txt");
    const event = createBlobEvent(ctx, BlobEventType.BlobCreated, "PutBlob", {
      eTag: "0x8D1",
      contentType: "text/plain",
      contentLength: 5,
      blobType: "BlockBlob"
    });

    assert.strictEqual(event.eventType, "Microsoft.Storage.BlobCreated");
    assert.strictEqual(
      event.subject,
      "/blobServices/default/containers/c1/blobs/path/to/file.txt"
    );
    assert.ok(event.topic.endsWith("/storageAccounts/devstoreaccount1"));
    assert.strictEqual(event.metadataVersion, "1");
    assert.strictEqual(event.data.api, "PutBlob");
    assert.strictEqual(event.data.requestId, "req-123");
    assert.strictEqual(event.data.clientRequestId, "client-abc");
    assert.strictEqual(event.data.eTag, "0x8D1");
    assert.strictEqual(event.data.contentLength, 5);
    assert.strictEqual(event.data.blobType, "BlockBlob");
    assert.strictEqual(
      event.data.url,
      "http://127.0.0.1:10000/devstoreaccount1/c1/path/to/file.txt"
    );
    assert.ok(typeof event.id === "string" && event.id.length > 0);
    assert.strictEqual(event.data.storageDiagnostics.batchId, "req-123");
  });

  it("uses a container-scoped subject for container events", () => {
    const ctx = makeContext("devstoreaccount1", "c1");
    const event = createBlobEvent(
      ctx,
      BlobEventType.ContainerDeleted,
      "DeleteContainer",
      {}
    );
    assert.strictEqual(event.eventType, "Microsoft.Storage.ContainerDeleted");
    assert.strictEqual(
      event.subject,
      "/blobServices/default/containers/c1"
    );
  });

  it("produces monotonically increasing 64-char hex sequencers", () => {
    const ctx = makeContext("devstoreaccount1", "c1", "b");
    const a = createBlobEvent(ctx, BlobEventType.BlobCreated, "PutBlob", {});
    const b = createBlobEvent(ctx, BlobEventType.BlobCreated, "PutBlob", {});
    assert.strictEqual(a.data.sequencer.length, 64);
    assert.ok(BigInt("0x" + b.data.sequencer) > BigInt("0x" + a.data.sequencer));
  });
});
