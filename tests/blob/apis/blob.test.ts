import {
  Aborter,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-blob";
import assert = require("assert");

import BlobConfiguration from "../../../src/blob/BlobConfiguration";
import Server from "../../../src/blob/BlobServer";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive,
  sleep
} from "../../testutils";

describe("BlobAPIs", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11000;
  const dbPath = "__testsstorage__";
  const persistencePath = "__testspersistence__";
  const config = new BlobConfiguration(
    host,
    port,
    dbPath,
    persistencePath,
    false
  );

  // TODO: Create serviceURL factory as tests utils
  const baseURL = `http://${host}:${port}/devstoreaccount1`;
  const serviceURL = new ServiceURL(
    baseURL,
    StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    )
  );

  let containerName: string = getUniqueName("container");
  let containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
  let blobName: string = getUniqueName("blob");
  let blobURL = BlobURL.fromContainerURL(containerURL, blobName);
  let blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
  const content = "Hello World";

  let server: Server;

  before(async () => {
    server = new Server(config);
    await server.start();
  });

  after(async () => {
    await server.close();
    await rmRecursive(dbPath);
    await rmRecursive(persistencePath);
  });

  beforeEach(async () => {
    containerName = getUniqueName("container");
    containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);
    blobName = getUniqueName("blob");
    blobURL = BlobURL.fromContainerURL(containerURL, blobName);
    blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
    await blockBlobURL.upload(Aborter.none, content, content.length);
  });

  afterEach(async () => {
    await containerURL.delete(Aborter.none);
  });

  it("download with with default parameters", async () => {
    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
  });

  it("download all parameters set", async () => {
    const result = await blobURL.download(Aborter.none, 0, 1, {
      rangeGetContentMD5: true
    });
    assert.deepStrictEqual(await bodyToString(result, 1), content[0]);
  });

  it("delete", async () => {
    await blobURL.delete(Aborter.none);
  });

  it("setMetadata with new metadata set", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    await blobURL.setMetadata(Aborter.none, metadata);
    const result = await blobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(result.metadata, metadata);
  });

  it("acquireLease_available_proposedLeaseId_fixed", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 30;
    await blobURL.acquireLease(Aborter.none, guid, duration);

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await blobURL.releaseLease(Aborter.none, guid);
  });

  it("acquireLease_available_NoproposedLeaseId_infinite", async () => {
    const leaseResult = await blobURL.acquireLease(Aborter.none, "", -1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await blobURL.releaseLease(Aborter.none, leaseId!);
  });

  it("releaseLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = -1;
    await blobURL.acquireLease(Aborter.none, guid, duration);

    let result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await blobURL.releaseLease(Aborter.none, guid);
    result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, undefined);
    assert.equal(result.leaseState, "available");
    assert.equal(result.leaseStatus, "unlocked");
  });

  it("renewLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    await blobURL.acquireLease(Aborter.none, guid, duration);

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await sleep(16 * 1000);
    const result2 = await blobURL.getProperties(Aborter.none);
    assert.ok(!result2.leaseDuration);
    assert.equal(result2.leaseState, "expired");
    assert.equal(result2.leaseStatus, "unlocked");

    await blobURL.renewLease(Aborter.none, guid);
    const result3 = await blobURL.getProperties(Aborter.none);
    assert.equal(result3.leaseDuration, "fixed");
    assert.equal(result3.leaseState, "leased");
    assert.equal(result3.leaseStatus, "locked");

    await blobURL.releaseLease(Aborter.none, guid);
  });

  it("changeLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    await blobURL.acquireLease(Aborter.none, guid, duration);

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const newGuid = "3c7e72ebb4304526bc53d8ecef03798f";
    await blobURL.changeLease(Aborter.none, guid, newGuid);

    await blobURL.getProperties(Aborter.none);
    await blobURL.releaseLease(Aborter.none, newGuid);
  });

  it("breakLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    await blobURL.acquireLease(Aborter.none, guid, duration);

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const breakDuration = 3;
    let breaklefttime = breakDuration;
    while (breaklefttime > 0) {
      const breakResult = await blobURL.breakLease(Aborter.none, breakDuration);

      assert.equal(breakResult.leaseTime! <= breaklefttime, true);
      breaklefttime = breakResult.leaseTime!;

      const result2 = await blobURL.getProperties(Aborter.none);
      assert.ok(!result2.leaseDuration);
      assert.equal(result2.leaseState, "breaking");
      assert.equal(result2.leaseStatus, "locked");

      await sleep(500);
    }

    const result3 = await blobURL.getProperties(Aborter.none);
    assert.ok(!result3.leaseDuration);
    assert.equal(result3.leaseState, "broken");
    assert.equal(result3.leaseStatus, "unlocked");

    await blobURL.releaseLease(Aborter.none, guid);
    const result4 = await blobURL.getProperties(Aborter.none);
    assert.equal(result4.leaseDuration, undefined);
    assert.equal(result4.leaseState, "available");
    assert.equal(result4.leaseStatus, "unlocked");
  });
});
