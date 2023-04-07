import assert = require("assert");
import { PassThrough } from "stream";
import {
  anyOfClass,
  anything,
  deepEqual,
  instance,
  mock,
  when
} from "ts-mockito";

import logger, { configLogger } from "../../../src/common/Logger";
import IExtentStore, {
  IExtentChunk
} from "../../../src/common/persistence/IExtentStore";
import DataLakeContext from "../../../src/dfs/context/DataLakeContext";
import * as Models from "../../../src/dfs/generated/artifacts/models";
import Context from "../../../src/dfs/generated/Context";
import IRequest from "../../../src/dfs/generated/IRequest";
import AppendBlobHandler from "../../../src/dfs/handlers/AppendBlobHandler";
import {
  BlockModel,
  IDataLakeMetadataStore
} from "../../../src/dfs/persistence/IDataLakeMetadataStore";
import {
  DEFAULT_FILE_PERMISSIONS,
  DEFAULT_GROUP,
  DEFAULT_OWNER,
  HeaderConstants
} from "../../../src/dfs/utils/constants";
import { getUniqueName } from "../../testutils";
import { toPermissions } from "../../../src/dfs/storage-file-datalake/transforms";

// Set true to enable debug log
configLogger(false);

describe("AppendBlobHandler", () => {
  const request: IRequest = mock<IRequest>();
  when(request.getHeader(HeaderConstants.CONTENT_MD5)).thenReturn(undefined);
  when(request.getRawHeaders()).thenReturn([]);

  const blobCtx = new DataLakeContext({ contextId: "" } as Context);
  blobCtx.contextId = getUniqueName("contextID");
  blobCtx.account = getUniqueName("account");
  blobCtx.container = getUniqueName("container");
  blobCtx.blob = getUniqueName("blob");
  blobCtx.request = instance(request);

  const buffer = Buffer.from("deadbeef");

  const properties: Models.BlobPropertiesInternal = {
    lastModified: new Date(),
    etag: getUniqueName("etag"),
    blobType: Models.BlobType.AppendBlob,
    contentLength: buffer.length
  };

  const extent: IExtentChunk = {
    id: getUniqueName("extentID"),
    offset: 0,
    count: buffer.length
  };

  const metadataStore: IDataLakeMetadataStore = mock<IDataLakeMetadataStore>();
  when(
    metadataStore.downloadBlob(
      anything(),
      blobCtx.account,
      blobCtx.container,
      blobCtx.blob,
      undefined
    )
  ).thenResolve({
    name: blobCtx.blob,
    accountName: blobCtx.account,
    containerName: blobCtx.container,
    isCommitted: false,
    properties,
    isDirectory: false,
    permissions: toPermissions(DEFAULT_FILE_PERMISSIONS)!,
    acl: [],
    owner: DEFAULT_OWNER,
    group: DEFAULT_GROUP
  });
  when(
    metadataStore.appendBlock(
      anything(),
      deepEqual({
        accountName: blobCtx.account,
        containerName: blobCtx.container,
        blobName: blobCtx.blob,
        isCommitted: true,
        name: "",
        size: extent.count,
        persistency: extent
      } as BlockModel),
      undefined,
      undefined,
      undefined
    )
  ).thenResolve(properties);

  const extentStore: IExtentStore = mock<IExtentStore>();
  when(
    // Need to reset the buffer stream for each test which calls this function
    // so we accept any PassThrough stream here.
    extentStore.appendExtent(anyOfClass(PassThrough), blobCtx.contextId)
  ).thenResolve(extent);

  describe("create", () => {
    it("accepts requests withContent-Length == 0 @loki @sql", async () => {
      const handler = new AppendBlobHandler(
        instance(metadataStore),
        instance(extentStore),
        logger,
        false
      );
      await assert.doesNotReject(async () => {
        await handler.create(0, {}, blobCtx);
      });
    });

    it("accepts requests with Content-Length != 0 in loose mode @loki @sql", async () => {
      const handler = new AppendBlobHandler(
        instance(metadataStore),
        instance(extentStore),
        logger,
        true
      );
      await assert.doesNotReject(async () => {
        await handler.create(buffer.length, {}, blobCtx);
      });
    });

    it("rejects requests with Content-Length != 0 @loki @sql", async () => {
      const handler = new AppendBlobHandler(
        instance(metadataStore),
        instance(extentStore),
        logger,
        false
      );
      await assert.rejects(
        async () => {
          await handler.create(buffer.length, {}, blobCtx);
        },
        {
          name: "StorageError",
          errorCode: "InvalidOperation"
        }
      );
    });
  });

  describe("appendBlock", () => {
    let bufferStream: PassThrough;
    beforeEach(() => {
      bufferStream = new PassThrough();
      bufferStream.end(buffer);
    });

    it("accepts requests with Content-Length != 0 @loki @sql", async () => {
      const handler = new AppendBlobHandler(
        instance(metadataStore),
        instance(extentStore),
        logger,
        false
      );
      await assert.doesNotReject(async () => {
        await handler.appendBlock(bufferStream, buffer.length, {}, blobCtx);
      });
    });

    it("rejects requests with Content-Length == 0 @loki @sql", async () => {
      const handler = new AppendBlobHandler(
        instance(metadataStore),
        instance(extentStore),
        logger,
        false
      );
      await assert.rejects(
        async () => {
          await handler.appendBlock(bufferStream, 0, {}, blobCtx);
        },
        {
          name: "StorageError",
          errorCode: "InvalidHeaderValue"
        }
      );
    });

    it("accepts requests with valid MD5 checksum @loki @sql", async () => {
      when(request.getHeader(HeaderConstants.CONTENT_MD5)).thenReturn(
        "T0EkOEfaaTpPNWwEhhFLxg=="
      );
      when(extentStore.readExtent(extent, blobCtx.contextId)).thenResolve(
        bufferStream
      );

      const handler = new AppendBlobHandler(
        instance(metadataStore),
        instance(extentStore),
        logger,
        false
      );
      await assert.doesNotReject(async () => {
        await handler.appendBlock(bufferStream, buffer.length, {}, blobCtx);
      });
    });

    it("rejects requests with invalid MD5 checksum @loki @sql", async () => {
      when(request.getHeader(HeaderConstants.CONTENT_MD5)).thenReturn(
        "d3JvbmdfTUQ1X2NoZWNrc3VtCg=="
      );
      when(extentStore.readExtent(extent, blobCtx.contextId)).thenResolve(
        bufferStream
      );

      const handler = new AppendBlobHandler(
        instance(metadataStore),
        instance(extentStore),
        logger,
        false
      );
      await assert.rejects(
        async () => {
          await handler.appendBlock(bufferStream, buffer.length, {}, blobCtx);
        },
        {
          name: "StorageError",
          errorCode: "Md5Mismatch"
        }
      );
    });
  });
});
