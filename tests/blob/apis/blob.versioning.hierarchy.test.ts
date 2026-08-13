import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";

import { IAccountModel } from "../../../src/common/account/AccountModel";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getTestServerBaseURL,
  getUniqueName
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

const VERSIONING_ENABLED_ACCOUNT_MODEL: IAccountModel = {
  accounts: [
    { name: EMULATOR_ACCOUNT_NAME, blobService: { isVersioningEnabled: true } }
  ]
};

/**
 * List Blobs with a delimiter squashes names into BlobPrefix entries, which is handled by
 * PageWithDelimiter - the same class that carries the continuation token. Versions make
 * that harder: every version of a blob shares its name, so a page can end part way through
 * the versions of a blob that is itself inside a squashed prefix.
 */
describe("BlobVersioningHierarchy", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer(
    false,
    false,
    false,
    undefined,
    VERSIONING_ENABLED_ACCOUNT_MODEL
  );

  const serviceClient = new BlobServiceClient(
    getTestServerBaseURL(server),
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      { retryOptions: { maxTries: 1 }, keepAliveOptions: { enable: false } }
    )
  );

  let containerName: string = getUniqueName("container");
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

  /**
   * Seed a fixed tree: two prefixes with two blobs each, plus a root level blob, with
   * several versions apiece.
   */
  async function seed() {
    const versions: { [name: string]: string[] } = {};
    const write = async (name: string, times: number) => {
      versions[name] = [];
      for (let i = 0; i < times; i++) {
        const res = await containerClient
          .getBlockBlobClient(name)
          .upload(`v${i}`, 2);
        versions[name].push(res.versionId!);
      }
    };
    await write("p1/a", 2);
    await write("p1/b", 2);
    await write("p2/c", 2);
    await write("root", 3);
    return versions;
  }

  /**
   * Page through a hierarchical listing, following continuation tokens, collecting the
   * blob items and prefixes each page returned.
   */
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

      if (result.done) break;

      const segment = result.value.segment;
      for (const item of segment.blobItems ?? []) {
        blobs.push(`${item.name}@${item.versionId ?? "-"}`);
      }
      for (const p of segment.blobPrefixes ?? []) {
        prefixes.push(p.name);
      }
      continuationToken = result.value.continuationToken;
      pages++;
      assert.ok(pages < 50, "Listing did not terminate");
    } while (continuationToken);

    return { blobs, prefixes, pages };
  }

  it("Hierarchical listing with versions squashes prefixes once @loki", async () => {
    const versions = await seed();

    const { blobs, prefixes } = await pageHierarchy(undefined, {
      includeVersions: true
    });

    // Each prefix appears exactly once, however many versions live underneath it
    assert.deepStrictEqual(prefixes, ["p1/", "p2/"]);

    // Only the root level blob is returned as a blob item, with all its versions
    assert.deepStrictEqual(
      blobs,
      versions["root"].map((v) => `root@${v}`)
    );
  });

  it("Hierarchical listing without versions is unaffected @loki", async () => {
    await seed();

    const { blobs, prefixes } = await pageHierarchy(undefined, {
      includeVersions: false
    });

    assert.deepStrictEqual(prefixes, ["p1/", "p2/"]);
    assert.strictEqual(blobs.length, 1, "Only the current version of root");
    assert.ok(blobs[0].startsWith("root@"));
  });

  it("Listing inside a prefix returns every version @loki", async () => {
    const versions = await seed();

    const { blobs, prefixes } = await pageHierarchy(undefined, {
      includeVersions: true,
      prefix: "p1/"
    });

    assert.deepStrictEqual(prefixes, [], "No nested prefixes under p1/");
    assert.deepStrictEqual(blobs, [
      ...versions["p1/a"].map((v) => `p1/a@${v}`),
      ...versions["p1/b"].map((v) => `p1/b@${v}`)
    ]);
  });

  it("Paginated hierarchical listing returns each prefix once and every version @loki", async () => {
    const versions = await seed();

    // A page size below the number of entries forces continuation across a squashed
    // prefix and part way through one blob's versions.
    const { blobs, prefixes, pages } = await pageHierarchy(2, {
      includeVersions: true
    });

    assert.ok(pages > 1, `Expected more than one page, got ${pages}`);

    // No prefix is emitted twice across pages
    assert.deepStrictEqual(
      prefixes,
      ["p1/", "p2/"],
      `Prefixes were duplicated or dropped across pages: ${JSON.stringify(prefixes)}`
    );

    // Every version of the root level blob is returned exactly once
    assert.deepStrictEqual(
      blobs,
      versions["root"].map((v) => `root@${v}`),
      `Blob items were duplicated or dropped across pages: ${JSON.stringify(blobs)}`
    );
  });

  /**
   * A harder tree than seed(): prefixes and blobs interleave lexically, and one blob has
   * the same name as another blob's prefix. Sorted order is
   *   a/1, b, c/1, p, p/x
   * so a hierarchical listing has to alternate between squashing prefixes and emitting
   * blobs, and "p" is a blob while "p/" is also a prefix.
   */
  async function seedInterleaved() {
    const versions: { [name: string]: string[] } = {};
    const write = async (name: string, times: number) => {
      versions[name] = [];
      for (let i = 0; i < times; i++) {
        const res = await containerClient
          .getBlockBlobClient(name)
          .upload(`v${i}`, 2);
        versions[name].push(res.versionId!);
      }
    };
    await write("a/1", 2);
    await write("b", 3);
    await write("c/1", 2);
    await write("p", 2);
    await write("p/x", 2);
    return versions;
  }

  it("Interleaved prefixes and blobs page correctly at size 1 @loki", async () => {
    const versions = await seedInterleaved();

    // Page size 1 is the tightest case: every page holds a single prefix or a single
    // blob version, so the continuation token is exercised on every boundary.
    const { blobs, prefixes, pages } = await pageHierarchy(1, {
      includeVersions: true
    });

    assert.ok(pages > 4, `Expected many pages at size 1, got ${pages}`);
    assert.deepStrictEqual(
      prefixes,
      ["a/", "c/", "p/"],
      `Prefixes duplicated or dropped: ${JSON.stringify(prefixes)}`
    );
    assert.deepStrictEqual(
      blobs,
      [
        ...versions["b"].map((v) => `b@${v}`),
        ...versions["p"].map((v) => `p@${v}`)
      ],
      `Blob items duplicated or dropped: ${JSON.stringify(blobs)}`
    );
  });

  it("A blob sharing a name with a prefix is listed separately @loki", async () => {
    const versions = await seedInterleaved();

    // "p" is a blob and "p/" is a prefix; both must appear, and the blob must keep all
    // of its versions.
    const { blobs, prefixes } = await pageHierarchy(undefined, {
      includeVersions: true
    });

    assert.ok(prefixes.includes("p/"));
    assert.deepStrictEqual(
      blobs.filter((b) => b.startsWith("p@")),
      versions["p"].map((v) => `p@${v}`)
    );
  });

  it("Flat listing of the interleaved tree returns every version at size 1 @loki", async () => {
    const versions = await seedInterleaved();

    const seen: string[] = [];
    let continuationToken: string | undefined;
    let pages = 0;
    do {
      const result = await containerClient
        .listBlobsFlat({ includeVersions: true })
        .byPage({ maxPageSize: 1, continuationToken })
        .next();
      if (result.done) break;
      for (const item of result.value.segment.blobItems) {
        seen.push(`${item.name}@${item.versionId}`);
      }
      continuationToken = result.value.continuationToken;
      pages++;
      assert.ok(pages < 60, "Listing did not terminate");
    } while (continuationToken);

    const expected = ["a/1", "b", "c/1", "p", "p/x"].flatMap((name) =>
      versions[name].map((v) => `${name}@${v}`)
    );
    assert.deepStrictEqual(seen, expected);
  });

  it("Paginated listing inside a prefix returns every version @loki", async () => {
    const versions = await seed();

    const { blobs, pages } = await pageHierarchy(2, {
      includeVersions: true,
      prefix: "p1/"
    });

    assert.ok(pages > 1, `Expected more than one page, got ${pages}`);
    assert.deepStrictEqual(blobs, [
      ...versions["p1/a"].map((v) => `p1/a@${v}`),
      ...versions["p1/b"].map((v) => `p1/b@${v}`)
    ]);
  });
});
