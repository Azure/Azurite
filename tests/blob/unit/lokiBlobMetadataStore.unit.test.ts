import * as assert from "assert";

import Context from "../../../src/blob/generated/Context";
import * as Models from "../../../src/blob/generated/artifacts/models";
import {
  BlobModel,
  BlockModel
} from "../../../src/blob/persistence/IBlobMetadataStore";
import LokiBlobMetadataStore from "../../../src/blob/persistence/LokiBlobMetadataStore";

const context = { contextId: "test", startTime: new Date() } as Context;
const account = "devstoreaccount1";
const container = "container";
const blobName = "blob";

describe("LokiBlobMetadataStore @loki", () => {
  let store: LokiBlobMetadataStore;

  beforeEach(async () => {
    store = new LokiBlobMetadataStore("lokiBlobMetadataStore.unit.test", true);
    await store.init();
    await store.createContainer(context, {
      accountName: account,
      name: container,
      properties: {
        etag: "container-etag",
        lastModified: new Date()
      }
    });
  });

  afterEach(async () => {
    await store.close();
  });

  async function commitVersion(blockName: string, etag: string, size: number) {
    const block: BlockModel = {
      accountName: account,
      containerName: container,
      blobName,
      isCommitted: false,
      name: blockName,
      size,
      persistency: { id: `extent-${blockName}`, offset: 0, count: size }
    };
    await store.stageBlock(context, block);

    const date = new Date();
    const blob: BlobModel = {
      accountName: account,
      containerName: container,
      name: blobName,
      snapshot: "",
      properties: {
        creationTime: date,
        lastModified: date,
        etag,
        blobType: Models.BlobType.BlockBlob
      },
      isCommitted: true
    };
    await store.commitBlockList(context, blob, [
      { blockName, blockCommitType: "Latest" }
    ]);
  }

  it("downloadBlob returns a snapshot that a later commitBlockList does not change", async () => {
    await commitVersion("block-v1", "etag-v1", 10);

    // A download handler holds this model across awaits while it streams the
    // body. A commit in that window must not change the version it describes.
    const downloaded = await store.downloadBlob(
      context,
      account,
      container,
      blobName
    );

    await commitVersion("block-v2", "etag-v2", 20);

    assert.strictEqual(downloaded.properties.etag, "etag-v1");
    assert.strictEqual(downloaded.properties.contentLength, 10);
    assert.deepStrictEqual(
      (downloaded.committedBlocksInOrder || []).map((block) => block.name),
      ["block-v1"]
    );

    const current = await store.downloadBlob(
      context,
      account,
      container,
      blobName
    );
    assert.strictEqual(current.properties.etag, "etag-v2");
    assert.strictEqual(current.properties.contentLength, 20);
    assert.deepStrictEqual(
      (current.committedBlocksInOrder || []).map((block) => block.name),
      ["block-v2"]
    );
  });

  for (const blobType of [Models.BlobType.AppendBlob, Models.BlobType.PageBlob]) {
    it(`${blobType} write prechecks do not traverse content metadata`, async () => {
      let extentReads = 0;
      const persistency = {
        get id() {
          extentReads++;
          return "extent";
        },
        offset: 0,
        count: 512
      };
      await store.createBlob(context, {
        accountName: account,
        containerName: container,
        name: blobName,
        snapshot: "",
        properties: {
          blobType,
          etag: "etag",
          lastModified: new Date(),
          contentLength: 512
        },
        isCommitted: true,
        ...(blobType === Models.BlobType.AppendBlob
          ? { committedBlocksInOrder: [{ name: "", size: 512, persistency }] }
          : { pageRangesInOrder: [{ start: 0, end: 511, persistency }] })
      });
      extentReads = 0;

      const blob = await store.downloadBlob(
        context,
        account,
        container,
        blobName,
        undefined,
        undefined,
        undefined,
        false
      );

      assert.strictEqual(blob.properties.blobType, blobType);
      assert.strictEqual(blob.properties.contentLength, 512);
      assert.strictEqual(extentReads, 0);
    });
  }
});
