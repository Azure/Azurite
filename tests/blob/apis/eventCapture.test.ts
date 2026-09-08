import {
  StorageSharedKeyCredential,
  BlobServiceClient,
  newPipeline
} from "@azure/storage-blob";
import * as assert from "assert";
import * as fs from "fs-extra";
import { join } from "path";

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

configLogger(false);

describe("Blob Event Capture @loki @sql", () => {
  const factory = new BlobTestServerFactory();
  const eventFolder = "__test_event_capture__";

  // Build a server with event capture enabled, pointing at eventFolder.
  const server = factory.createServer(false, false, false, undefined, true, eventFolder);

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const serviceClient = new BlobServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      { retryOptions: { maxTries: 1 } }
    )
  );

  function readEvents(): any[] {
    if (!fs.existsSync(eventFolder)) {
      return [];
    }
    const parsed: any[] = [];
    for (const f of fs.readdirSync(eventFolder)) {
      if (!f.endsWith(".json")) {
        continue;
      }
      try {
        parsed.push(
          JSON.parse(fs.readFileSync(join(eventFolder, f), "utf8").toString())
        );
      } catch {
        // A file that isn't valid JSON yet is one the sink hasn't finished
        // publishing; skip it and let the poll retry. (Atomic rename in the
        // sink makes this rare, but the guard keeps the reader robust.)
      }
    }
    return parsed;
  }

  // Event writes are fire-and-forget: the SDK call returns before the JSON
  // file is on disk. Poll (rather than a single fixed sleep) until the
  // expected event appears, so the test stays reliable under load / on the
  // slower @sql path. Returns the full snapshot once `minCount` events match
  // the predicate, or after the timeout — a genuine miss still fails the
  // assertion because the returned snapshot won't contain the event.
  async function waitForEvents(
    predicate: (e: any) => boolean,
    minCount: number = 1,
    timeoutMs: number = 5000
  ): Promise<any[]> {
    const deadline = Date.now() + timeoutMs;
    let events = readEvents();
    while (
      events.filter(predicate).length < minCount &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 50));
      events = readEvents();
    }
    return events;
  }

  before(async () => {
    if (fs.existsSync(eventFolder)) {
      fs.removeSync(eventFolder);
    }
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
    if (fs.existsSync(eventFolder)) {
      fs.removeSync(eventFolder);
    }
  });

  it("captures ContainerCreated and ContainerDeleted", async () => {
    const containerName = getUniqueName("evt-c");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    // Name-scope the filter so accumulated events from other tests cannot
    // satisfy it (the shared folder is not cleared between `it`s).
    const createdPred = (e: any) =>
      e.eventType === "Microsoft.Storage.ContainerCreated" &&
      e.subject.endsWith(`/containers/${containerName}`);
    let events = await waitForEvents(createdPred);
    const created = events.filter(createdPred);
    assert.ok(created.length >= 1, "expected a ContainerCreated event");
    assert.strictEqual(created[0].data.api, "CreateContainer");

    // Deleting the container must emit a matching ContainerDeleted event.
    await containerClient.delete();
    const deletedPred = (e: any) =>
      e.eventType === "Microsoft.Storage.ContainerDeleted" &&
      e.subject.endsWith(`/containers/${containerName}`);
    events = await waitForEvents(deletedPred);
    const deleted = events.filter(deletedPred);
    assert.ok(deleted.length >= 1, "expected a ContainerDeleted event");
    assert.strictEqual(deleted[0].data.api, "DeleteContainer");
  });

  it("captures BlobCreated (PutBlob) and BlobDeleted for a block blob", async () => {
    const containerName = getUniqueName("evt-b");
    const blobName = getUniqueName("blob");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const body = "hello events";
    await blockBlobClient.upload(body, body.length);
    await blockBlobClient.delete();

    const createdPred = (e: any) =>
      e.eventType === "Microsoft.Storage.BlobCreated" &&
      e.data.api === "PutBlob" &&
      e.subject.endsWith(`/blobs/${blobName}`);
    const deletedPred = (e: any) =>
      e.eventType === "Microsoft.Storage.BlobDeleted" &&
      e.subject.endsWith(`/blobs/${blobName}`);

    // Both writes are independent fire-and-forget, so wait for each in turn.
    await waitForEvents(createdPred);
    const events = await waitForEvents(deletedPred);

    const created = events.filter(createdPred);
    assert.ok(created.length >= 1, "expected a BlobCreated PutBlob event");
    assert.strictEqual(created[0].data.contentLength, body.length);
    assert.strictEqual(created[0].data.blobType, "BlockBlob");
    assert.ok(created[0].data.eTag && created[0].data.eTag.length > 0);
    assert.strictEqual(created[0].metadataVersion, "1");
    // The persisted URL must never carry a query string (no SAS/secret leak).
    assert.ok(
      typeof created[0].data.url === "string" &&
        !created[0].data.url.includes("?"),
      "data.url must be present and query-free"
    );

    const deleted = events.filter(deletedPred);
    assert.ok(deleted.length >= 1, "expected a BlobDeleted event");
    assert.strictEqual(deleted[0].data.api, "DeleteBlob");

    await containerClient.delete();
  });

  it("captures BlobCreated (PutBlock then PutBlockList) on commit", async () => {
    const containerName = getUniqueName("evt-bl");
    const blobName = getUniqueName("blob");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const b64 = (s: string) => Buffer.from(s).toString("base64");
    await blockBlobClient.stageBlock(b64("id1"), "part1", 5);
    await blockBlobClient.commitBlockList([b64("id1")]);

    const forThisBlob = (e: any) => e.subject.endsWith(`/blobs/${blobName}`);
    // PutBlock and PutBlockList are separate fire-and-forget writes and may
    // land in either order; wait for both before asserting.
    await waitForEvents((e) => forThisBlob(e) && e.data.api === "PutBlock");
    const events = await waitForEvents(
      (e) => forThisBlob(e) && e.data.api === "PutBlockList"
    );

    const apis = events.filter(forThisBlob).map((e) => e.data.api);
    assert.ok(apis.includes("PutBlock"), "expected a PutBlock event");
    assert.ok(apis.includes("PutBlockList"), "expected a PutBlockList event");

    await containerClient.delete();
  });
});

describe("Blob Event Capture disabled by default @loki @sql", () => {
  const factory = new BlobTestServerFactory();
  const eventFolder = "__test_event_capture_off__";
  const server = factory.createServer(); // no capture args -> disabled

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const serviceClient = new BlobServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      { retryOptions: { maxTries: 1 } }
    )
  );

  before(async () => {
    if (fs.existsSync(eventFolder)) {
      fs.removeSync(eventFolder);
    }
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
    if (fs.existsSync(eventFolder)) {
      fs.removeSync(eventFolder);
    }
  });

  it("writes no event files when capture is off", async () => {
    const containerName = getUniqueName("evt-off");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();
    const blockBlobClient = containerClient.getBlockBlobClient(getUniqueName("b"));
    await blockBlobClient.upload("x", 1);

    // Best-effort wait: give any (erroneous) write a chance to happen before
    // asserting the folder was never created. Polling can't prove a negative,
    // so a short fixed wait is the right tool here.
    await new Promise((r) => setTimeout(r, 300));

    assert.ok(
      !fs.existsSync(eventFolder),
      "no event folder should be created when capture is disabled"
    );

    await containerClient.delete();
  });
});
