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
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive,
  sleep
} from "../../testutils";

describe("ContainerAPIs", () => {
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

  // Open following line to enable debug log
  // configLogger(true);

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

  let server: Server;
  let containerName: string = getUniqueName("container");
  let containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

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
  });

  afterEach(async () => {
    await containerURL.delete(Aborter.none);
  });

  it("setMetadata", async () => {
    const metadata = {
      key0: "val0",
      keya: "vala",
      keyb: "valb"
    };
    await containerURL.setMetadata(Aborter.none, metadata);

    const result = await containerURL.getProperties(Aborter.none);
    assert.deepEqual(result.metadata, metadata);
  });

  it("getProperties", async () => {
    const result = await containerURL.getProperties(Aborter.none);
    assert.ok(result.eTag!.length > 0);
    assert.ok(result.lastModified);
    assert.ok(!result.leaseDuration);
    assert.equal(result.leaseState, "available");
    assert.equal(result.leaseStatus, "unlocked");
    assert.ok(result.requestId);
    assert.ok(result.version);
    assert.ok(result.date);
    assert.ok(!result.blobPublicAccess);
  });

  it("create with default parameters", done => {
    // create() with default parameters has been tested in beforeEach
    done();
  });

  it("create with all parameters configured", async () => {
    const cURL = ContainerURL.fromServiceURL(
      serviceURL,
      getUniqueName(containerName)
    );
    const metadata = { key: "value" };
    const access = "container";
    await cURL.create(Aborter.none, { metadata, access });
    const result = await cURL.getProperties(Aborter.none);
    assert.deepEqual(result.blobPublicAccess, access);
    assert.deepEqual(result.metadata, metadata);
  });

  it("delete", done => {
    // delete() with default parameters has been tested in afterEach
    done();
  });

  it("listBlobHierarchySegment with default parameters", async () => {
    const blobURLs = [];
    for (let i = 0; i < 3; i++) {
      const blobURL = BlobURL.fromContainerURL(
        containerURL,
        getUniqueName(`blockblob${i}/${i}`)
      );
      const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
      await blockBlobURL.upload(Aborter.none, "", 0);
      blobURLs.push(blobURL);
    }

    const delimiter = "/";
    const result = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      delimiter
    );
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerURL.url.indexOf(result.containerName));
    assert.deepStrictEqual(result.nextMarker, "");
    assert.deepStrictEqual(result.delimiter, delimiter);
    assert.deepStrictEqual(
      result.segment.blobPrefixes!.length,
      blobURLs.length
    );

    for (const blob of blobURLs) {
      let i = 0;
      assert.ok(blob.url.indexOf(result.segment.blobPrefixes![i++].name));
    }

    for (const blob of blobURLs) {
      await blob.delete(Aborter.none);
    }
  });

  it("listBlobHierarchySegment with all parameters configured", async () => {
    const blobURLs = [];
    const prefix = "blockblob";
    const metadata = {
      keya: "a",
      keyb: "c"
    };
    const delimiter = "/";
    for (let i = 0; i < 2; i++) {
      const blobURL = BlobURL.fromContainerURL(
        containerURL,
        getUniqueName(`${prefix}${i}${delimiter}${i}`)
      );
      const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
      await blockBlobURL.upload(Aborter.none, "", 0, {
        metadata
      });
      blobURLs.push(blobURL);
    }

    const result = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      delimiter,
      undefined,
      {
        include: [
          "metadata",
          "uncommittedblobs",
          "copy",
          "deleted",
          "snapshots"
        ],
        maxresults: 1,
        prefix
      }
    );
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerURL.url.indexOf(result.containerName));
    assert.deepStrictEqual(result.segment.blobPrefixes!.length, 1);
    assert.deepStrictEqual(result.segment.blobItems!.length, 0);
    assert.ok(blobURLs[0].url.indexOf(result.segment.blobPrefixes![0].name));

    const result2 = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      delimiter,
      result.nextMarker,
      {
        include: [
          "metadata",
          "uncommittedblobs",
          "copy",
          "deleted",
          "snapshots"
        ],
        maxresults: 2,
        prefix
      }
    );
    assert.ok(result2.serviceEndpoint.length > 0);
    assert.ok(containerURL.url.indexOf(result2.containerName));
    assert.deepStrictEqual(result2.segment.blobPrefixes!.length, 1);
    assert.deepStrictEqual(result2.segment.blobItems!.length, 0);
    assert.ok(blobURLs[0].url.indexOf(result2.segment.blobPrefixes![0].name));

    const result3 = await containerURL.listBlobHierarchySegment(
      Aborter.none,
      delimiter,
      undefined,
      {
        include: [
          "metadata",
          "uncommittedblobs",
          "copy",
          "deleted",
          "snapshots"
        ],
        maxresults: 2,
        prefix: `${prefix}0${delimiter}`
      }
    );
    assert.ok(result3.serviceEndpoint.length > 0);
    assert.ok(containerURL.url.indexOf(result3.containerName));
    assert.deepStrictEqual(result3.nextMarker, "");
    assert.deepStrictEqual(result3.delimiter, delimiter);
    assert.deepStrictEqual(result3.segment.blobItems!.length, 1);
    assert.deepStrictEqual(result3.segment.blobItems![0].metadata, metadata);
    assert.ok(blobURLs[0].url.indexOf(result3.segment.blobItems![0].name));

    for (const blob of blobURLs) {
      await blob.delete(Aborter.none);
    }
  });

  it("acquireLease_available_proposedLeaseId_fixed", async () => {
    const guid = "ca761232-ed42-11ce-bacd-00aa0057b223";
    const duration = 30;
    await containerURL.acquireLease(Aborter.none, guid, duration);

    const result = await containerURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await containerURL.releaseLease(Aborter.none, guid);
  });

  it("acquireLease_available_NoproposedLeaseId_infinite", async () => {
    const leaseResult = await containerURL.acquireLease(Aborter.none, "", -1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const result = await containerURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await containerURL.releaseLease(Aborter.none, leaseId!);
  });

  it("releaseLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = -1;
    await containerURL.acquireLease(Aborter.none, guid, duration);

    const result = await containerURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await containerURL.releaseLease(Aborter.none, guid);
  });

  it("renewLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    await containerURL.acquireLease(Aborter.none, guid, duration);

    const result = await containerURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await sleep(16 * 1000);
    const result2 = await containerURL.getProperties(Aborter.none);
    assert.ok(!result2.leaseDuration);
    assert.equal(result2.leaseState, "expired");
    assert.equal(result2.leaseStatus, "unlocked");

    await containerURL.renewLease(Aborter.none, guid);
    const result3 = await containerURL.getProperties(Aborter.none);
    assert.equal(result3.leaseDuration, "fixed");
    assert.equal(result3.leaseState, "leased");
    assert.equal(result3.leaseStatus, "locked");

    await containerURL.releaseLease(Aborter.none, guid);
  });

  it("changeLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    await containerURL.acquireLease(Aborter.none, guid, duration);

    const result = await containerURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const newGuid = "3c7e72ebb4304526bc53d8ecef03798f";
    await containerURL.changeLease(Aborter.none, guid, newGuid);

    await containerURL.getProperties(Aborter.none);
    await containerURL.releaseLease(Aborter.none, newGuid);
  });

  it("breakLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    await containerURL.acquireLease(Aborter.none, guid, duration);

    const result = await containerURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const breakDuration = 30;
    let breaklefttime = breakDuration;
    while (breaklefttime > 0) {
      const breakResult = await containerURL.breakLease(
        Aborter.none,
        breakDuration
      );

      assert.equal(breakResult.leaseTime! <= breaklefttime, true);
      breaklefttime = breakResult.leaseTime!;

      const result2 = await containerURL.getProperties(Aborter.none);
      assert.ok(!result2.leaseDuration);
      if (breaklefttime !== 0) {
        assert.equal(result2.leaseState, "breaking");
        assert.equal(result2.leaseStatus, "locked");
      }

      await sleep(500);
    }

    const result3 = await containerURL.getProperties(Aborter.none);
    assert.ok(!result3.leaseDuration);
    assert.equal(result3.leaseState, "broken");
    assert.equal(result3.leaseStatus, "unlocked");
  });

  it("should correctly list all blobs in the container using listBlobFlatSegment with default parameters", async () => {
    const blobURLs = [];
    for (let i = 0; i < 3; i++) {
      const blobURL = BlobURL.fromContainerURL(
        containerURL,
        getUniqueName(`blockblob${i}/${i}`)
      );
      const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
      await blockBlobURL.upload(Aborter.none, "", 0);
      blobURLs.push(blobURL);
    }

    const inputmarker = "";
    const result = await containerURL.listBlobFlatSegment(
      Aborter.none,
      inputmarker
    );
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerURL.url.indexOf(result.containerName));
    assert.deepStrictEqual(result.nextMarker, "");
    assert.deepStrictEqual(result.segment.blobItems!.length, blobURLs.length);

    for (const blob of blobURLs) {
      let i = 0;
      assert.ok(blob.url.indexOf(result.segment.blobItems![i++].name));
    }

    for (const blob of blobURLs) {
      await blob.delete(Aborter.none);
    }
  });

  it("getAccessPolicy", async () => {
    const result = await containerURL.getAccessPolicy(Aborter.none);
    assert.ok(result.eTag!.length > 0);
    assert.ok(result.lastModified);
    assert.ok(result.requestId);
    assert.ok(result.version);
    assert.ok(result.date);
  });

  it("setAccessPolicy_publicAccess", async () => {
    const access = "blob";
    const containerAcl = [
      {
        accessPolicy: {
          expiry: new Date("2018-12-31T11:22:33.4567890Z"),
          permission: "rwd",
          start: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      }
    ];
    await containerURL.setAccessPolicy(Aborter.none, access, containerAcl);
    const result = await containerURL.getAccessPolicy(Aborter.none);
    // assert.deepEqual(result.signedIdentifiers, containerAcl);
    assert.deepEqual(result.blobPublicAccess, access);
  });

  // Skip since getAccessPolicy can't get signedIdentifiers now
  it.skip("setAccessPolicy_signedIdentifiers", async () => {
    const access = "container";
    const containerAcl = [
      {
        accessPolicy: {
          expiry: new Date("2018-12-31T11:22:33.4567890Z"),
          permission: "rwdl",
          start: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      },
      {
        accessPolicy: {
          expiry: new Date("2030-11-31T11:22:33.4567890Z"),
          permission: "w",
          start: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "policy2"
      }
    ];

    await containerURL.setAccessPolicy(Aborter.none, access, containerAcl);
    const result = await containerURL.getAccessPolicy(Aborter.none);
    assert.deepEqual(result.signedIdentifiers, containerAcl);
    assert.deepEqual(result.blobPublicAccess, access);
  });
});
