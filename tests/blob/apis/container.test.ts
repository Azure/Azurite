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

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  sleep
} from "../../testutils";

// Set to true enable debug log
configLogger(false);

describe("ContainerAPIs", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
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

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
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
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
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
    const result_create = await cURL.create(Aborter.none, { metadata, access });
    assert.equal(
      result_create._response.request.headers.get("x-ms-client-request-id"),
      result_create.clientRequestId
    );
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
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
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
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

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
    assert.deepStrictEqual(result3.segment.blobItems![0].metadata, {
      encrypted: undefined,
      ...metadata
    });
    assert.ok(blobURLs[0].url.indexOf(result3.segment.blobItems![0].name));

    for (const blob of blobURLs) {
      await blob.delete(Aborter.none);
    }
  });

  it("acquireLease_available_proposedLeaseId_fixed", async () => {
    const guid = "ca761232-ed42-11ce-bacd-00aa0057b223";
    const duration = 30;
    const result_acquire = await containerURL.acquireLease(
      Aborter.none,
      guid,
      duration
    );
    assert.equal(
      result_acquire._response.request.headers.get("x-ms-client-request-id"),
      result_acquire.clientRequestId
    );

    const result = await containerURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const result_release = await containerURL.releaseLease(Aborter.none, guid);
    assert.equal(
      result_release._response.request.headers.get("x-ms-client-request-id"),
      result_release.clientRequestId
    );
  });

  it("acquireLease_available_NoproposedLeaseId_infinite", async () => {
    const leaseResult = await containerURL.acquireLease(Aborter.none, "", -1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const result = await containerURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

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

    const result_renew = await containerURL.renewLease(Aborter.none, guid);
    const result3 = await containerURL.getProperties(Aborter.none);
    assert.equal(result3.leaseDuration, "fixed");
    assert.equal(result3.leaseState, "leased");
    assert.equal(result3.leaseStatus, "locked");
    assert.equal(
      result_renew._response.request.headers.get("x-ms-client-request-id"),
      result_renew.clientRequestId
    );

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
    const result_change = await containerURL.changeLease(
      Aborter.none,
      guid,
      newGuid
    );
    assert.equal(
      result_change._response.request.headers.get("x-ms-client-request-id"),
      result_change.clientRequestId
    );

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
      assert.equal(
        breakResult._response.request.headers.get("x-ms-client-request-id"),
        breakResult.clientRequestId
      );
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

    const inputmarker = undefined;
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

  it("should correctly order all blobs in the container", async () => {
    const blobURLs = [];
    const blobNames: Array<string> = [];

    for (let i = 1; i < 4; i++) {
      const name = `blockblob${i}/abc-00${i}`;
      const blobURL = BlobURL.fromContainerURL(containerURL, name);
      const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
      await blockBlobURL.upload(Aborter.none, "", 0);
      blobURLs.push(blobURL);
      blobNames.push(name);
    }

    const inputmarker = undefined;
    const result = await containerURL.listBlobFlatSegment(
      Aborter.none,
      inputmarker,
      {
        prefix: "blockblob"
      }
    );
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerURL.url.indexOf(result.containerName));
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const gotNames: Array<string> = [];

    for (const item of result.segment.blobItems) {
      gotNames.push(item.name);
    }

    assert.deepStrictEqual(gotNames, blobNames);

    for (const blob of blobURLs) {
      await blob.delete(Aborter.none);
    }
  });

  it("returns a valid, correct nextMarker", async () => {
    const blobURLs = [];
    let blobNames: Array<string> = [
      "blockblob/abc-001",
      "blockblob/abc-004",
      "blockblob/abc-009",
      "blockblob/abc-003",
      "blockblob/abc-006",
      "blockblob/abc-000",
      "blockblob/abc-007",
      "blockblob/abc-002",
      "blockblob/abc-005",
      "blockblob/abc-008"
    ];

    for (let i = 0; i < 10; i++) {
      const blobURL = BlobURL.fromContainerURL(containerURL, blobNames[i]);
      const blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
      await blockBlobURL.upload(Aborter.none, "", 0);
      blobURLs.push(blobURL);
    }

    // Sort blob names for comparison
    blobNames = blobNames.sort();

    const inputmarker = undefined;
    let result = await containerURL.listBlobFlatSegment(
      Aborter.none,
      inputmarker,
      {
        maxresults: 4
      }
    );
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerURL.url.indexOf(result.containerName));
    assert.equal(result.nextMarker, "blockblob/abc-003");
    assert.equal(result.segment.blobItems.length, 4);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const gotNames: Array<string> = [];

    for (const item of result.segment.blobItems) {
      gotNames.push(item.name);
    }

    result = await containerURL.listBlobFlatSegment(
      Aborter.none,
      result.nextMarker,
      {
        maxresults: 4
      }
    );
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerURL.url.indexOf(result.containerName));
    assert.equal(result.nextMarker, "blockblob/abc-007");
    assert.equal(result.segment.blobItems.length, 4);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    for (const item of result.segment.blobItems) {
      gotNames.push(item.name);
    }

    result = await containerURL.listBlobFlatSegment(
      Aborter.none,
      result.nextMarker,
      {
        maxresults: 4
      }
    );
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerURL.url.indexOf(result.containerName));
    assert.strictEqual(result.nextMarker, "");
    assert.equal(result.segment.blobItems.length, 2);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    for (const item of result.segment.blobItems) {
      gotNames.push(item.name);
    }

    assert.deepStrictEqual(gotNames, blobNames);

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
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
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
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  // Skip since getAccessPolicy can't get signedIdentifiers now
  it("setAccessPolicy_signedIdentifiers", async () => {
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

    const result_set = await containerURL.setAccessPolicy(
      Aborter.none,
      access,
      containerAcl
    );
    assert.equal(
      result_set._response.request.headers.get("x-ms-client-request-id"),
      result_set.clientRequestId
    );
    const result = await containerURL.getAccessPolicy(Aborter.none);
    assert.deepEqual(result.signedIdentifiers, containerAcl);
    assert.deepEqual(result.blobPublicAccess, access);
  });
});
