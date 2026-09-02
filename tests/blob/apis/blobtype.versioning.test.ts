import {
  BlobClient,
  BlobServiceClient,
  ContainerClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import assert = require("assert");

import { configLogger } from "../../../src/common/Logger";
import { AccountModel } from "../../../src/common/account/AccountModel";
import LokiAccountModelStore from "../../../src/common/account/LokiAccountModelStore";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

configLogger(false);

type TestBlobType = "BlockBlob" | "PageBlob" | "AppendBlob";
type CopyMode = "asynchronous" | "synchronous";

interface BlobState {
  blobType: string | undefined;
  content: Buffer;
  contentLength: number | undefined;
  etag: string | undefined;
  metadata: Record<string, string> | undefined;
  versions: Map<string, Buffer>;
}

const blobTypes: TestBlobType[] = ["BlockBlob", "PageBlob", "AppendBlob"];
const crossTypeTransitions = blobTypes.flatMap((destinationType) =>
  blobTypes
    .filter((sourceType) => sourceType !== destinationType)
    .map((sourceType) => ({ sourceType, destinationType }))
);

function createAccountModelStore(
  versioningEnabled: boolean,
  databaseFile: string
): LokiAccountModelStore {
  const accountModels = new Map<string, AccountModel>();
  accountModels.set(EMULATOR_ACCOUNT_NAME, {
    key: EMULATOR_ACCOUNT_KEY,
    isBlobVersioningEnabled: versioningEnabled
  });
  return new LokiAccountModelStore(databaseFile, true, accountModels);
}

function createServiceClient(server: any): BlobServiceClient {
  return new BlobServiceClient(
    `http://${server.config.host}:${server.config.port}/${EMULATOR_ACCOUNT_NAME}`,
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
}

async function writeBlob(
  containerClient: ContainerClient,
  blobName: string,
  blobType: TestBlobType,
  marker: string
): Promise<void> {
  const metadata = { marker };

  switch (blobType) {
    case "BlockBlob": {
      const content = Buffer.from(`block-${marker}`);
      await containerClient
        .getBlockBlobClient(blobName)
        .upload(content, content.length, { metadata });
      return;
    }
    case "PageBlob": {
      const content = Buffer.alloc(512, marker.charCodeAt(0));
      const client = containerClient.getPageBlobClient(blobName);
      await client.create(content.length, { metadata });
      await client.uploadPages(content, 0, content.length);
      return;
    }
    case "AppendBlob": {
      const content = Buffer.from(`append-${marker}`);
      const client = containerClient.getAppendBlobClient(blobName);
      await client.create({ metadata });
      await client.appendBlock(content, content.length);
      return;
    }
  }
}

async function listVersionIds(
  containerClient: ContainerClient,
  blobName: string
): Promise<string[]> {
  const versionIds: string[] = [];
  for await (const blob of containerClient.listBlobsFlat({
    includeVersions: true
  })) {
    if (blob.name === blobName && blob.versionId) {
      versionIds.push(blob.versionId);
    }
  }
  return versionIds.sort();
}

async function captureBlobState(
  containerClient: ContainerClient,
  blobName: string
): Promise<BlobState> {
  const client = containerClient.getBlobClient(blobName);
  const properties = await client.getProperties();
  const versions = new Map<string, Buffer>();

  for (const versionId of await listVersionIds(containerClient, blobName)) {
    versions.set(
      versionId,
      await client.withVersion(versionId).downloadToBuffer()
    );
  }

  return {
    blobType: properties.blobType,
    content: await client.downloadToBuffer(),
    contentLength: properties.contentLength,
    etag: properties.etag,
    metadata: properties.metadata,
    versions
  };
}

async function assertBlobStateUnchanged(
  containerClient: ContainerClient,
  blobName: string,
  expected: BlobState
): Promise<void> {
  const actual = await captureBlobState(containerClient, blobName);
  assert.strictEqual(actual.blobType, expected.blobType);
  assert.deepStrictEqual(actual.content, expected.content);
  assert.strictEqual(actual.contentLength, expected.contentLength);
  assert.strictEqual(actual.etag, expected.etag);
  assert.deepStrictEqual(actual.metadata, expected.metadata);
  assert.deepStrictEqual(
    [...actual.versions.keys()],
    [...expected.versions.keys()]
  );
  for (const [versionId, content] of expected.versions) {
    assert.deepStrictEqual(actual.versions.get(versionId), content);
  }
}

async function assertInvalidBlobType(operation: Promise<unknown>): Promise<void> {
  await assert.rejects(operation, (error: any) => {
    assert.strictEqual(error.statusCode, 409);
    assert.strictEqual(error.code, "InvalidBlobType");
    return true;
  });
}

async function copyBlob(
  source: BlobClient,
  destination: BlobClient,
  mode: CopyMode
): Promise<void> {
  if (mode === "synchronous") {
    await destination.syncCopyFromURL(source.url);
  } else {
    const poller = await destination.beginCopyFromURL(source.url);
    await poller.pollUntilDone();
  }
}

describe("Blob type consistency with versioning @loki", () => {
  const factory = new BlobTestServerFactory();
  const accountModelStore = createAccountModelStore(
    true,
    "__test_db_blobtype_versioning__.json"
  );
  const server = factory.createServer(
    false,
    false,
    false,
    undefined,
    accountModelStore
  );
  const serviceClient = createServiceClient(server);
  let containerClient: ContainerClient;

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async () => {
    containerClient = serviceClient.getContainerClient(
      getUniqueName("blobtype")
    );
    await containerClient.create();
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  for (const { sourceType, destinationType } of crossTypeTransitions) {
    it(`rejects direct ${sourceType} to ${destinationType} replacement`, async () => {
      const blobName = getUniqueName("direct");
      await writeBlob(containerClient, blobName, sourceType, "a");
      await writeBlob(containerClient, blobName, sourceType, "b");

      const before = await captureBlobState(containerClient, blobName);
      assert.strictEqual(before.blobType, sourceType);
      assert.strictEqual(before.versions.size, 2);

      await assertInvalidBlobType(
        writeBlob(containerClient, blobName, destinationType, "c")
      );
      await assertBlobStateUnchanged(containerClient, blobName, before);
    });
  }

  for (const { sourceType, destinationType } of crossTypeTransitions) {
    for (const mode of ["asynchronous", "synchronous"] as CopyMode[]) {
      it(`rejects ${mode} ${sourceType} copy over versioned ${destinationType}`, async () => {
        const sourceName = getUniqueName("copy-source");
        const destinationName = getUniqueName("copy-destination");
        await writeBlob(containerClient, sourceName, sourceType, "s");
        await writeBlob(
          containerClient,
          destinationName,
          destinationType,
          "a"
        );
        await writeBlob(
          containerClient,
          destinationName,
          destinationType,
          "b"
        );

        const sourceBefore = await captureBlobState(
          containerClient,
          sourceName
        );
        const destinationBefore = await captureBlobState(
          containerClient,
          destinationName
        );
        assert.strictEqual(destinationBefore.versions.size, 2);

        await assertInvalidBlobType(
          copyBlob(
            containerClient.getBlobClient(sourceName),
            containerClient.getBlobClient(destinationName),
            mode
          )
        );
        await assertBlobStateUnchanged(
          containerClient,
          destinationName,
          destinationBefore
        );
        await assertBlobStateUnchanged(
          containerClient,
          sourceName,
          sourceBefore
        );
      });
    }
  }

  for (const blobType of blobTypes) {
    for (const mode of ["asynchronous", "synchronous"] as CopyMode[]) {
      it(`allows ${mode} same-type ${blobType} copy with versions`, async () => {
        const sourceName = getUniqueName("same-copy-source");
        const destinationName = getUniqueName("same-copy-destination");
        await writeBlob(containerClient, sourceName, blobType, "s");
        await writeBlob(containerClient, destinationName, blobType, "a");
        await writeBlob(containerClient, destinationName, blobType, "b");

        await copyBlob(
          containerClient.getBlobClient(sourceName),
          containerClient.getBlobClient(destinationName),
          mode
        );

        const source = await captureBlobState(containerClient, sourceName);
        const destination = await captureBlobState(
          containerClient,
          destinationName
        );
        assert.strictEqual(destination.blobType, blobType);
        assert.deepStrictEqual(destination.content, source.content);
        assert.strictEqual(destination.versions.size, 3);
      });
    }
  }

  it("requires deleting the base blob and every version before changing type", async () => {
    const blobName = getUniqueName("delete-all");
    await writeBlob(containerClient, blobName, "BlockBlob", "a");
    await writeBlob(containerClient, blobName, "BlockBlob", "b");
    const versionIds = await listVersionIds(containerClient, blobName);
    const versionContents = new Map<string, Buffer>();
    assert.strictEqual(versionIds.length, 2);

    const blobClient = containerClient.getBlobClient(blobName);
    for (const versionId of versionIds) {
      versionContents.set(
        versionId,
        await blobClient.withVersion(versionId).downloadToBuffer()
      );
    }
    await blobClient.delete();

    await assertInvalidBlobType(
      writeBlob(containerClient, blobName, "AppendBlob", "c")
    );
    await assert.rejects(blobClient.getProperties(), (error: any) => {
      assert.strictEqual(error.statusCode, 404);
      return true;
    });
    assert.deepStrictEqual(
      await listVersionIds(containerClient, blobName),
      versionIds
    );
    for (const [versionId, content] of versionContents) {
      assert.deepStrictEqual(
        await blobClient.withVersion(versionId).downloadToBuffer(),
        content
      );
    }

    for (const versionId of versionIds) {
      await blobClient.withVersion(versionId).delete();
    }

    await writeBlob(containerClient, blobName, "AppendBlob", "c");
    const recreated = await captureBlobState(containerClient, blobName);
    assert.strictEqual(recreated.blobType, "AppendBlob");
    assert.strictEqual(recreated.versions.size, 1);
  });

});

describe("Blob type replacement without versioning @loki", () => {
  const factory = new BlobTestServerFactory();
  const accountModelStore = createAccountModelStore(
    false,
    "__test_db_blobtype_versioning_disabled__.json"
  );
  const server = factory.createServer(
    false,
    false,
    false,
    undefined,
    accountModelStore
  );
  const serviceClient = createServiceClient(server);
  let containerClient: ContainerClient;

  before(async () => {
    await server.start();
    containerClient = serviceClient.getContainerClient(
      getUniqueName("blobtype-disabled")
    );
    await containerClient.create();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it("preserves cross-type replacement behavior when versioning is disabled", async () => {
    const blobName = getUniqueName("disabled");
    await writeBlob(containerClient, blobName, "BlockBlob", "a");
    await writeBlob(containerClient, blobName, "PageBlob", "b");
    const properties = await containerClient
      .getBlobClient(blobName)
      .getProperties();
    assert.strictEqual(properties.blobType, "PageBlob");
    assert.deepStrictEqual(await listVersionIds(containerClient, blobName), []);
  });
});
