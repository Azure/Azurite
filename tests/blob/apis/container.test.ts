import {
  Aborter,
  AnonymousCredential,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  StorageURL,
} from "@azure/storage-blob";
import assert = require("assert");

import BlobConfiguration from "../../../src/blob/BlobConfiguration";
import Server from "../../../src/blob/BlobServer";
import { getUniqueName, rmRecursive } from "../../testutils";

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
    StorageURL.newPipeline(new AnonymousCredential(), {
      retryOptions: { maxTries: 1 }
    })
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
        include: ["metadata", "uncommittedblobs", "copy", "deleted"],
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
        include: ["metadata", "uncommittedblobs", "copy", "deleted"],
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
        include: ["metadata", "uncommittedblobs", "copy", "deleted"],
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
});
