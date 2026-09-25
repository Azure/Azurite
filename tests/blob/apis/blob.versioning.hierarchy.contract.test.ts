import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";

import { AccountModel } from "../../../src/common/account/AccountModel";
import { configLogger } from "../../../src/common/Logger";
import LokiAccountModelStore from "../../../src/common/account/LokiAccountModelStore";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getTestServerBaseURL,
  getUniqueName
} from "../../testutils";

configLogger(false);

const RUN_VERSIONING_CONTRACT_TESTS =
  process.env.AZURITE_RUN_VERSIONING_CONTRACT_TESTS === "1";
const contractDescribe = RUN_VERSIONING_CONTRACT_TESTS
  ? describe
  : describe.skip;
const accountModel: AccountModel = {
  key: EMULATOR_ACCOUNT_NAME,
  isBlobVersioningEnabled: true
};

contractDescribe("Blob Versioning Hierarchy Contract", () => {
  const factory = new BlobTestServerFactory();
  const accountModelStore = new LokiAccountModelStore(
    "",
    true,
    new Map([[EMULATOR_ACCOUNT_NAME, accountModel]])
  );
  const server = factory.createServer(
    false,
    false,
    false,
    undefined,
    accountModelStore
  );
  const serviceClient = new BlobServiceClient(
    getTestServerBaseURL(server),
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        keepAliveOptions: { enable: false }
      }
    )
  );

  let containerName = getUniqueName("container");
  let containerClient = serviceClient.getContainerClient(containerName);

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
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  async function seed() {
    const versions: { [name: string]: string[] } = {};
    const write = async (name: string, count: number) => {
      versions[name] = [];
      for (let i = 0; i < count; i++) {
        const result = await containerClient
          .getBlockBlobClient(name)
          .upload(`v${i}`, 2);
        versions[name].push(result.versionId!);
      }
    };

    await write("p1/a", 2);
    await write("p1/b", 2);
    await write("p2/c", 2);
    await write("root", 3);
    return versions;
  }

  async function seedInterleaved() {
    const versions: { [name: string]: string[] } = {};
    const write = async (name: string, count: number) => {
      versions[name] = [];
      for (let i = 0; i < count; i++) {
        const result = await containerClient
          .getBlockBlobClient(name)
          .upload(`v${i}`, 2);
        versions[name].push(result.versionId!);
      }
    };

    await write("a/1", 2);
    await write("b", 3);
    await write("c/1", 2);
    await write("p", 2);
    await write("p/x", 2);
    return versions;
  }

  async function pageHierarchy(
    pageSize: number | undefined,
    options: { includeVersions?: boolean; prefix?: string } = {}
  ) {
    const blobs: string[] = [];
    const prefixes: string[] = [];
    let continuationToken: string | undefined;
    let pages = 0;

    do {
      const result = await containerClient
        .listBlobsByHierarchy("/", {
          includeVersions: options.includeVersions,
          prefix: options.prefix
        })
        .byPage({ maxPageSize: pageSize, continuationToken })
        .next();
      if (result.done) {
        break;
      }

      for (const item of result.value.segment.blobItems ?? []) {
        blobs.push(`${item.name}@${item.versionId ?? "-"}`);
      }
      for (const prefix of result.value.segment.blobPrefixes ?? []) {
        prefixes.push(prefix.name);
      }
      continuationToken = result.value.continuationToken;
      pages++;
      assert.ok(pages < 60, "Listing did not terminate");
    } while (continuationToken);

    return { blobs, prefixes, pages };
  }

  it("returns each prefix once with versions enabled @versioning-contract", async () => {
    const versions = await seed();
    const { blobs, prefixes } = await pageHierarchy(undefined, {
      includeVersions: true
    });

    assert.deepStrictEqual(prefixes, ["p1/", "p2/"]);
    assert.deepStrictEqual(
      blobs,
      versions.root.map((version) => `root@${version}`)
    );
  });

  it("keeps hierarchy listing unchanged without versions @versioning-contract", async () => {
    await seed();
    const { blobs, prefixes } = await pageHierarchy(undefined);

    assert.deepStrictEqual(prefixes, ["p1/", "p2/"]);
    assert.strictEqual(blobs.length, 1);
    assert.ok(blobs[0].startsWith("root@"));
  });

  it("returns every version inside a prefix @versioning-contract", async () => {
    const versions = await seed();
    const { blobs, prefixes } = await pageHierarchy(undefined, {
      includeVersions: true,
      prefix: "p1/"
    });

    assert.deepStrictEqual(prefixes, []);
    assert.deepStrictEqual(blobs, [
      ...versions["p1/a"].map((version) => `p1/a@${version}`),
      ...versions["p1/b"].map((version) => `p1/b@${version}`)
    ]);
  });

  it("paginates hierarchy without duplicating prefixes @versioning-contract", async () => {
    const versions = await seed();
    const { blobs, prefixes, pages } = await pageHierarchy(2, {
      includeVersions: true
    });

    assert.ok(pages > 1);
    assert.deepStrictEqual(prefixes, ["p1/", "p2/"]);
    assert.deepStrictEqual(
      blobs,
      versions.root.map((version) => `root@${version}`)
    );
  });

  it("handles interleaved prefixes and blobs at page size one @versioning-contract", async () => {
    const versions = await seedInterleaved();
    const { blobs, prefixes, pages } = await pageHierarchy(1, {
      includeVersions: true
    });

    assert.ok(pages > 4);
    assert.deepStrictEqual(prefixes, ["a/", "c/", "p/"]);
    assert.deepStrictEqual(blobs, [
      ...versions.b.map((version) => `b@${version}`),
      ...versions.p.map((version) => `p@${version}`)
    ]);
  });

  it("lists a blob separately from a same-name prefix @versioning-contract", async () => {
    const versions = await seedInterleaved();
    const { blobs, prefixes } = await pageHierarchy(undefined, {
      includeVersions: true
    });

    assert.ok(prefixes.includes("p/"));
    assert.deepStrictEqual(
      blobs.filter((blob) => blob.startsWith("p@")),
      versions.p.map((version) => `p@${version}`)
    );
  });

  it("returns every flat-list version at page size one @versioning-contract", async () => {
    const versions = await seedInterleaved();
    const seen: string[] = [];
    let continuationToken: string | undefined;
    let pages = 0;

    do {
      const result = await containerClient
        .listBlobsFlat({ includeVersions: true })
        .byPage({ maxPageSize: 1, continuationToken })
        .next();
      if (result.done) {
        break;
      }

      for (const item of result.value.segment.blobItems) {
        seen.push(`${item.name}@${item.versionId}`);
      }
      continuationToken = result.value.continuationToken;
      pages++;
      assert.ok(pages < 60, "Listing did not terminate");
    } while (continuationToken);

    const expected = ["a/1", "b", "c/1", "p", "p/x"].flatMap((name) =>
      versions[name].map((version) => `${name}@${version}`)
    );
    assert.deepStrictEqual(seen, expected);
  });

  it("paginates every version inside a prefix @versioning-contract", async () => {
    const versions = await seed();
    const { blobs, pages } = await pageHierarchy(2, {
      includeVersions: true,
      prefix: "p1/"
    });

    assert.ok(pages > 1);
    assert.deepStrictEqual(blobs, [
      ...versions["p1/a"].map((version) => `p1/a@${version}`),
      ...versions["p1/b"].map((version) => `p1/b@${version}`)
    ]);
  });
});
