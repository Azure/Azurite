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
    return fs
      .readdirSync(eventFolder)
      .filter((f) => f.endsWith(".json"))
      .map((f) =>
        JSON.parse(fs.readFileSync(join(eventFolder, f), "utf8").toString())
      );
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

  it("captures ContainerCreated on container create", async () => {
    const containerName = getUniqueName("evt-c");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    // Writes are fire-and-forget; give them a tick to flush.
    await new Promise((r) => setTimeout(r, 200));

    const events = readEvents();
    const created = events.filter(
      (e) => e.eventType === "Microsoft.Storage.ContainerCreated"
    );
    assert.ok(created.length >= 1, "expected a ContainerCreated event");
    assert.strictEqual(created[0].data.api, "CreateContainer");
    assert.ok(
      created[0].subject.endsWith(`/containers/${containerName}`),
      "container subject should reference the container"
    );

    await containerClient.delete();
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

    await new Promise((r) => setTimeout(r, 200));

    const events = readEvents();

    const created = events.filter(
      (e) =>
        e.eventType === "Microsoft.Storage.BlobCreated" &&
        e.data.api === "PutBlob" &&
        e.subject.endsWith(`/blobs/${blobName}`)
    );
    assert.ok(created.length >= 1, "expected a BlobCreated PutBlob event");
    assert.strictEqual(created[0].data.contentLength, body.length);
    assert.strictEqual(created[0].data.blobType, "BlockBlob");
    assert.ok(created[0].data.eTag && created[0].data.eTag.length > 0);
    assert.strictEqual(created[0].metadataVersion, "1");

    const deleted = events.filter(
      (e) =>
        e.eventType === "Microsoft.Storage.BlobDeleted" &&
        e.subject.endsWith(`/blobs/${blobName}`)
    );
    assert.ok(deleted.length >= 1, "expected a BlobDeleted event");
    assert.strictEqual(deleted[0].data.api, "DeleteBlob");

    await containerClient.delete();
  });

  it("captures BlobCreated (PutBlockList) on commit", async () => {
    const containerName = getUniqueName("evt-bl");
    const blobName = getUniqueName("blob");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const b64 = (s: string) => Buffer.from(s).toString("base64");
    await blockBlobClient.stageBlock(b64("id1"), "part1", 5);
    await blockBlobClient.commitBlockList([b64("id1")]);

    await new Promise((r) => setTimeout(r, 200));

    const events = readEvents();
    const apis = events
      .filter((e) => e.subject.endsWith(`/blobs/${blobName}`))
      .map((e) => e.data.api);
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

    await new Promise((r) => setTimeout(r, 200));

    assert.ok(
      !fs.existsSync(eventFolder),
      "no event folder should be created when capture is disabled"
    );

    await containerClient.delete();
  });
});
