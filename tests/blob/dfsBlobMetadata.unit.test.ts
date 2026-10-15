/**
 * Unit tests for the handling of the DFS (ADLS Gen2) internal metadata keys by
 * Blob API writes.
 */

import * as assert from "assert";

import BaseHandler, { BlobWriteKind } from "../../src/blob/handlers/BaseHandler";
import Context from "../../src/blob/generated/Context";
import IBlobMetadataStore from "../../src/blob/persistence/IBlobMetadataStore";
import {
  keepDfsInternalMetadata,
  removeDfsAclMetadata,
  removeDfsInternalMetadata
} from "../../src/blob/utils/utils";

class TestHandler extends BaseHandler {
  public metadataFor(
    requestMetadata?: { [key: string]: string },
    kind?: BlobWriteKind
  ) {
    return this.blobWriteMetadata(
      new Context({}, "ctx"), "account", "container", "blob",
      requestMetadata, kind
    );
  }
}

function handlerWithStore(
  getBlobProperties: () => Promise<any>,
  containerMetadata: { [key: string]: string } = { azurite_hns_enabled: "true" }
): TestHandler {
  const store = {
    getBlobProperties,
    getContainerProperties: () => Promise.resolve({ metadata: containerMetadata })
  } as unknown as IBlobMetadataStore;
  return new TestHandler(store, undefined as any, undefined as any, false, true);
}

const forged = {
  foo: "bar",
  HDI_ISFOLDER: "true",
  dfsaclowner: "attacker",
  dfsAcl: "user::rwx,group::rwx,other::rwx"
};

describe("DFS internal metadata on Blob API writes @loki", () => {
  it("removes the access control keys, case-insensitively", () => {
    assert.deepStrictEqual(removeDfsAclMetadata(forged), { foo: "bar", HDI_ISFOLDER: "true" });
    assert.deepStrictEqual(removeDfsInternalMetadata(forged), { foo: "bar" });
    assert.strictEqual(removeDfsAclMetadata(undefined), undefined);
  });

  it("keeps the internal keys of the replaced blob and ignores the written ones", () => {
    assert.deepStrictEqual(
      keepDfsInternalMetadata(forged, { hdi_isfolder: "true", dfsAclOwner: "owner", old: "x" }),
      { foo: "bar", hdi_isfolder: "true", dfsAclOwner: "owner" }
    );
    assert.strictEqual(keepDfsInternalMetadata(undefined, { old: "x" }), undefined);
  });

  it("only creates a directory from an empty blob with hdi_isfolder=true", async () => {
    const missing = handlerWithStore(() => Promise.reject({ statusCode: 404 }));
    assert.deepStrictEqual(await missing.metadataFor(forged, BlobWriteKind.EmptyBlockBlob), { foo: "bar", HDI_ISFOLDER: "true" });
    assert.deepStrictEqual(await missing.metadataFor({ hdi_isfolder: "false" }, BlobWriteKind.EmptyBlockBlob), {});
    assert.deepStrictEqual(await missing.metadataFor(forged, BlobWriteKind.Content), { foo: "bar" });
  });

  it("keeps the DFS state of an existing blob", async () => {
    const existing = handlerWithStore(() =>
      Promise.resolve({ metadata: { hdi_isfolder: "true", dfsAclOwner: "owner" } })
    );
    assert.deepStrictEqual(await existing.metadataFor(forged, BlobWriteKind.EmptyBlockBlob), {
      foo: "bar",
      hdi_isfolder: "true",
      dfsAclOwner: "owner"
    });
    assert.deepStrictEqual(await existing.metadataFor(forged, BlobWriteKind.Metadata), {
      foo: "bar",
      hdi_isfolder: "true",
      dfsAclOwner: "owner"
    });
  });

  it("doesn't write data onto a directory", async () => {
    const directory = handlerWithStore(() => Promise.resolve({ metadata: { hdi_isfolder: "true" } }));
    await assert.rejects(
      directory.metadataFor({ foo: "bar" }, BlobWriteKind.Content),
      (err: any) => err.statusCode === 409 && err.storageErrorCode === "OperationNotSupportedOnDirectory"
    );
  });

  it("doesn't treat a store failure as a missing blob", async () => {
    const failing = handlerWithStore(() => Promise.reject({ statusCode: 500, message: "database unavailable" }));
    await assert.rejects(failing.metadataFor(forged), (err: any) => err.statusCode === 500);
  });

  it("leaves the DFS keys alone in a container without hierarchical namespace", async () => {
    const flat = handlerWithStore(
      () => Promise.resolve({ metadata: { dfsAclOwner: "owner" } }),
      { azurite_hns_enabled: "false" }
    );
    assert.deepStrictEqual(await flat.metadataFor(forged, BlobWriteKind.Content), forged);
  });
});
