import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import assert = require("assert");

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  base64encode,
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
  const serviceClient = new BlobServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      }
    )
  );

  let containerName: string = getUniqueName("container");
  let containerClient = serviceClient.getContainerClient(containerName);
  let blobLeaseClient = containerClient.getBlobLeaseClient();

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async () => {
    containerName = getUniqueName("container");
    containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();
    blobLeaseClient = containerClient.getBlobLeaseClient();
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  it("setMetadata @loki @sql", async () => {
    const metadata = {
      key0: "val0",
      keya: "vala",
      keyb: "valb"
    };
    await containerClient.setMetadata(metadata);

    const result = await containerClient.getProperties();
    assert.deepEqual(result.metadata, metadata);
  });

  it("setMetadata should work with conditional headers @loki @sql", async () => {
    // const properties = await containerClient.getProperties();
    await containerClient.setMetadata(
      {},
      {
        conditions: {
          ifModifiedSince: new Date("2018/01/01")
        }
      }
    );
  });

  it("setMetadata should not work with invalid conditional headers @loki @sql", async () => {
    try {
      await containerClient.setMetadata(
        {},
        {
          conditions: {
            ifModifiedSince: new Date("2118/01/01")
          }
        }
      );
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }

    assert.fail();
  });

  it("getProperties @loki @sql", async () => {
    const result = await containerClient.getProperties();
    assert.ok(result.etag!.length > 0);
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

  it("getProperties should return 404 for non existed container @loki @sql", async () => {
    const nonExistedContainerURL = serviceClient.getContainerClient(
      "404container_"
    );
    let expectedError = false;
    try {
      await nonExistedContainerURL.getProperties();
    } catch (err) {
      if (err.response.status === 404) {
        expectedError = true;
      }
    }
    assert.ok(expectedError);
  });

  it("create with default parameters @loki @sql", (done) => {
    // create() with default parameters has been tested in beforeEach
    done();
  });

  it("create with all parameters configured @loki @sql", async () => {
    const cURL = serviceClient.getContainerClient(getUniqueName(containerName));
    const metadata = { key: "value" };
    const access = "container";
    const result_create = await cURL.create({ metadata, access });
    assert.equal(
      result_create._response.request.headers.get("x-ms-client-request-id"),
      result_create.clientRequestId
    );
    const result = await cURL.getProperties();
    assert.deepEqual(result.blobPublicAccess, access);
    assert.deepEqual(result.metadata, metadata);
  });

  it("delete @loki @sql", (done) => {
    // delete() with default parameters has been tested in afterEach
    done();
  });

  it("listBlobHierarchySegment with default parameters @loki @sql", async () => {
    const blobClients = [];
    for (let i = 0; i < 3; i++) {
      const blobClient = containerClient.getBlobClient(
        getUniqueName(`blockblob${i}/${i}`)
      );
      const blockBlobClient = blobClient.getBlockBlobClient();
      await blockBlobClient.upload("", 0);
      blobClients.push(blobClient);
    }

    const delimiter = "/";
    const result = (
      await containerClient.listBlobsByHierarchy(delimiter).byPage().next()
    ).value;
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerClient.url.indexOf(result.containerName));
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
    assert.deepStrictEqual(result.continuationToken, "");
    assert.deepStrictEqual(result.delimiter, delimiter);
    assert.deepStrictEqual(
      result.segment.blobPrefixes!.length,
      blobClients.length
    );

    for (const blob of blobClients) {
      let i = 0;
      assert.ok(blob.url.indexOf(result.segment.blobPrefixes![i++].name));
    }

    for (const blob of blobClients) {
      await blob.delete();
    }
  });

  it("listBlobHierarchySegment with all parameters configured @loki @sql", async () => {
    const blobClients = [];
    const prefix = "blockblob";
    const metadata = {
      keya: "a",
      keyb: "c"
    };
    const delimiter = "/";
    for (let i = 0; i < 2; i++) {
      const blobClient = containerClient.getBlobClient(
        getUniqueName(`${prefix}${i}${delimiter}${i}`)
      );
      const blockBlobClient = blobClient.getBlockBlobClient();
      await blockBlobClient.upload("", 0, {
        metadata
      });
      blobClients.push(blobClient);
    }

    const result = (
      await containerClient
        .listBlobsByHierarchy(delimiter, {
          includeCopy: true,
          includeDeleted: true,
          includeMetadata: true,
          includeSnapshots: true,
          includeUncommitedBlobs: true,
          prefix
        })
        .byPage({ maxPageSize: 1 })
        .next()
    ).value;
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerClient.url.indexOf(result.containerName));
    assert.deepStrictEqual(result.segment.blobPrefixes!.length, 1);
    assert.deepStrictEqual(result.segment.blobItems!.length, 0);
    assert.ok(blobClients[0].url.indexOf(result.segment.blobPrefixes![0].name));
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const result2 = (
      await containerClient
        .listBlobsByHierarchy(delimiter, {
          includeCopy: true,
          includeDeleted: true,
          includeMetadata: true,
          includeSnapshots: true,
          includeUncommitedBlobs: true,
          prefix
        })
        .byPage({
          continuationToken: result.continuationToken,
          maxPageSize: 2
        })
        .next()
    ).value;
    assert.ok(result2.serviceEndpoint.length > 0);
    assert.ok(containerClient.url.indexOf(result2.containerName));
    assert.deepStrictEqual(result2.segment.blobPrefixes!.length, 1);
    assert.deepStrictEqual(result2.segment.blobItems!.length, 0);
    assert.ok(
      blobClients[0].url.indexOf(result2.segment.blobPrefixes![0].name)
    );

    const result3 = (
      await containerClient
        .listBlobsByHierarchy(delimiter, {
          includeCopy: true,
          includeDeleted: true,
          includeMetadata: true,
          includeSnapshots: true,
          includeUncommitedBlobs: true,
          prefix: `${prefix}0${delimiter}`
        })
        .byPage({ maxPageSize: 2 })
        .next()
    ).value;
    assert.ok(result3.serviceEndpoint.length > 0);
    assert.ok(containerClient.url.indexOf(result3.containerName));
    assert.deepStrictEqual(result3.continuationToken, "");
    assert.deepStrictEqual(result3.delimiter, delimiter);
    assert.deepStrictEqual(result3.segment.blobItems!.length, 1);
    assert.deepStrictEqual(result3.segment.blobItems![0].metadata, {
      ...metadata
    });
    assert.ok(blobClients[0].url.indexOf(result3.segment.blobItems![0].name));
    const getResult = await blobClients[0].getProperties();
    assert.equal(
      getResult.etag,
      '"' + result3.segment.blobItems![0].properties.etag + '"'
    );

    for (const blob of blobClients) {
      await blob.delete();
    }
  });

  it("acquireLease_available_proposedLeaseId_fixed @loki @sql", async () => {
    const guid = "ca761232-ed42-11ce-bacd-00aa0057b223";
    const duration = 30;
    blobLeaseClient = containerClient.getBlobLeaseClient(guid);
    const result_acquire = await blobLeaseClient.acquireLease(duration);
    assert.equal(
      result_acquire._response.request.headers.get("x-ms-client-request-id"),
      result_acquire._response.request.requestId
    );

    const result = await containerClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const result_release = await blobLeaseClient.releaseLease();
    assert.equal(
      result_release._response.request.headers.get("x-ms-client-request-id"),
      result_release._response.request.requestId
    );
  });

  it("acquireLease_available_NoproposedLeaseId_infinite @loki @sql", async () => {
    const leaseResult = await blobLeaseClient.acquireLease(-1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const result = await containerClient.getProperties();
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    await blobLeaseClient.releaseLease();
  });

  it("releaseLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = -1;
    blobLeaseClient = containerClient.getBlobLeaseClient(guid);
    await blobLeaseClient.acquireLease(duration);

    const result = await containerClient.getProperties();
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await blobLeaseClient.releaseLease();
  });

  it("renewLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    blobLeaseClient = containerClient.getBlobLeaseClient(guid);
    await blobLeaseClient.acquireLease(duration);

    const result = await containerClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await sleep(16 * 1000);
    const result2 = await containerClient.getProperties();
    assert.ok(!result2.leaseDuration);
    assert.equal(result2.leaseState, "expired");
    assert.equal(result2.leaseStatus, "unlocked");

    await blobLeaseClient.renewLease();
    const result3 = await containerClient.getProperties();
    assert.equal(result3.leaseDuration, "fixed");
    assert.equal(result3.leaseState, "leased");
    assert.equal(result3.leaseStatus, "locked");

    await blobLeaseClient.releaseLease();
  });

  it("changeLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    blobLeaseClient = containerClient.getBlobLeaseClient(guid);
    await blobLeaseClient.acquireLease(duration);

    const result = await containerClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const newGuid = "3c7e72ebb4304526bc53d8ecef03798f";
    const result_change = await blobLeaseClient.changeLease(newGuid);
    assert.equal(
      result_change._response.request.headers.get("x-ms-client-request-id"),
      result_change._response.request.requestId
    );

    await containerClient.getProperties();
    await blobLeaseClient.releaseLease();
  });

  it("breakLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    blobLeaseClient = containerClient.getBlobLeaseClient(guid);
    await blobLeaseClient.acquireLease(duration);

    const result = await containerClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const breakDuration = 30;
    let breaklefttime = breakDuration;
    while (breaklefttime > 0) {
      const breakResult = await blobLeaseClient.breakLease(breakDuration);

      assert.equal(breakResult.leaseTime! <= breaklefttime, true);
      assert.equal(
        breakResult._response.request.headers.get("x-ms-client-request-id"),
        breakResult._response.request.requestId
      );
      breaklefttime = breakResult.leaseTime!;

      const result2 = await containerClient.getProperties();
      assert.ok(!result2.leaseDuration);
      if (breaklefttime !== 0) {
        assert.equal(result2.leaseState, "breaking");
        assert.equal(result2.leaseStatus, "locked");
      }

      await sleep(500);
    }

    const result3 = await containerClient.getProperties();
    assert.ok(!result3.leaseDuration);
    assert.equal(result3.leaseState, "broken");
    assert.equal(result3.leaseStatus, "unlocked");
  });

  it("should correctly list all blobs in the container using listBlobFlatSegment with default parameters @loki @sql", async () => {
    const blobClients = [];
    for (let i = 0; i < 3; i++) {
      const blobClient = containerClient.getBlobClient(
        getUniqueName(`blockblob${i}/${i}`)
      );
      const blockBlobClient = blobClient.getBlockBlobClient();
      await blockBlobClient.upload("", 0);
      blobClients.push(blobClient);
    }

    const inputmarker = undefined;
    const result = (
      await containerClient
        .listBlobsFlat()
        .byPage({ continuationToken: inputmarker })
        .next()
    ).value;
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerClient.url.indexOf(result.containerName));
    assert.deepStrictEqual(result.continuationToken, "");
    assert.deepStrictEqual(
      result.segment.blobItems!.length,
      blobClients.length
    );

    let i = 0;
    for (const blob of blobClients) {
      assert.ok(blob.url.indexOf(result.segment.blobItems![i].name));
      const getResult = await blob.getProperties();
      assert.equal(
        getResult.etag,
        '"' + result.segment.blobItems![i].properties.etag + '"'
      );
      assert.deepStrictEqual(result.segment.blobItems![i].snapshot, undefined);
      i++;
    }

    for (const blob of blobClients) {
      await blob.delete();
    }
  });

  it("should only show uncommitted blobs in listBlobFlatSegment with uncommittedblobs option @loki @sql", async () => {
    const blobClient = containerClient.getBlobClient(
      getUniqueName("uncommittedblob")
    );
    const blockBlobClient = blobClient.getBlockBlobClient();

    const body = "HelloWorld";
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);

    const result1 = (
      await containerClient
        .listBlobsFlat({
          includeUncommitedBlobs: true
        })
        .byPage()
        .next()
    ).value;
    assert.equal(result1.segment.blobItems.length, 1);

    const result2 = (await containerClient.listBlobsFlat().byPage().next())
      .value;
    assert.equal(result2.segment.blobItems.length, 0);
  });

  it("should only show uncommitted blobs in listBlobHierarchySegment with uncommittedblobs option @loki @sql", async () => {
    const delimiter = "/";
    const blobClient = containerClient.getBlobClient(
      getUniqueName("path/uncommittedblob")
    );
    const blockBlobClient = blobClient.getBlockBlobClient();

    const body = "HelloWorld";
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);

    const result1 = (
      await containerClient
        .listBlobsByHierarchy(delimiter, {
          includeUncommitedBlobs: true
        })
        .byPage()
        .next()
    ).value;
    assert.equal(result1.segment.blobPrefixes!.length, 1);

    const result2 = (
      await containerClient.listBlobsByHierarchy(delimiter).byPage().next()
    ).value;
    assert.equal(result2.segment.blobPrefixes!.length, 0);
  });

  it("should correctly order all blobs in the container @loki @sql", async () => {
    const blobClients = [];
    const blobNames: Array<string> = [];

    for (let i = 1; i < 4; i++) {
      const name = `blockblob${i}/abc-00${i}`;
      const blobClient = containerClient.getBlobClient(name);
      const blockBlobClient = blobClient.getBlockBlobClient();
      await blockBlobClient.upload("", 0);
      blobClients.push(blobClient);
      blobNames.push(name);
    }

    const inputmarker = undefined;
    const result = (
      await containerClient
        .listBlobsFlat({
          prefix: "blockblob"
        })
        .byPage({ continuationToken: inputmarker })
        .next()
    ).value;
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerClient.url.indexOf(result.containerName));
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const gotNames: Array<string> = [];

    for (const item of result.segment.blobItems) {
      gotNames.push(item.name);
    }

    assert.deepStrictEqual(gotNames, blobNames);

    for (const blob of blobClients) {
      await blob.delete();
    }
  });

  it("returns a valid, correct continuationToken @loki @sql", async () => {
    const blobClients = [];
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
      const blobClient = containerClient.getBlobClient(blobNames[i]);
      const blockBlobClient = blobClient.getBlockBlobClient();
      await blockBlobClient.upload("", 0);
      blobClients.push(blobClient);
    }

    // Sort blob names for comparison
    blobNames = blobNames.sort();

    const inputmarker = undefined;
    let result = (
      await containerClient
        .listBlobsFlat()
        .byPage({ continuationToken: inputmarker, maxPageSize: 4 })
        .next()
    ).value;
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerClient.url.indexOf(result.containerName));
    assert.equal(result.continuationToken, "blockblob/abc-003");
    assert.equal(result.segment.blobItems.length, 4);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const gotNames: Array<string> = [];

    for (const item of result.segment.blobItems) {
      gotNames.push(item.name);
    }

    result = (
      await containerClient
        .listBlobsFlat()
        .byPage({
          continuationToken: result.continuationToken,
          maxPageSize: 4
        })
        .next()
    ).value;
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerClient.url.indexOf(result.containerName));
    assert.equal(result.continuationToken, "blockblob/abc-007");
    assert.equal(result.segment.blobItems.length, 4);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    for (const item of result.segment.blobItems) {
      gotNames.push(item.name);
    }

    result = (
      await containerClient
        .listBlobsFlat()
        .byPage({
          continuationToken: result.continuationToken,
          maxPageSize: 4
        })
        .next()
    ).value;
    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(containerClient.url.indexOf(result.containerName));
    assert.strictEqual(result.continuationToken, "");
    assert.equal(result.segment.blobItems.length, 2);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    for (const item of result.segment.blobItems) {
      gotNames.push(item.name);
    }

    assert.deepStrictEqual(gotNames, blobNames);

    for (const blob of blobClients) {
      await blob.delete();
    }
  });

  it("getAccessPolicy @loki @sql", async () => {
    const result = await containerClient.getAccessPolicy();
    assert.ok(result.etag!.length > 0);
    assert.ok(result.lastModified);
    assert.ok(result.requestId);
    assert.ok(result.version);
    assert.ok(result.date);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("setAccessPolicy_publicAccess @loki @sql", async () => {
    const access = "blob";
    const containerAcl = [
      {
        accessPolicy: {
          expiresOn: new Date("2018-12-31T11:22:33.4567890Z"),
          permissions: "rwd",
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      }
    ];
    await containerClient.setAccessPolicy(access, containerAcl);
    const result = await containerClient.getAccessPolicy();
    // assert.deepEqual(result.signedIdentifiers, containerAcl);
    assert.deepEqual(result.blobPublicAccess, access);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  // Skip since getAccessPolicy can't get signedIdentifiers now
  it("setAccessPolicy_signedIdentifiers @loki @sql", async () => {
    const access = "container";
    const containerAcl = [
      {
        accessPolicy: {
          expiresOn: new Date("2018-12-31T11:22:33.4567890Z"),
          permissions: "rwdl",
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      },
      {
        accessPolicy: {
          expiresOn: new Date("2030-11-31T11:22:33.4567890Z"),
          permissions: "w",
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "policy2"
      }
    ];

    const result_set = await containerClient.setAccessPolicy(
      access,
      containerAcl
    );
    assert.equal(
      result_set._response.request.headers.get("x-ms-client-request-id"),
      result_set.clientRequestId
    );
    const result = await containerClient.getAccessPolicy();
    assert.deepEqual(result.signedIdentifiers, containerAcl);
    assert.deepEqual(result.blobPublicAccess, access);
  });
});
