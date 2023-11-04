import { AbortController } from "@azure/abort-controller";
import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import assert = require("assert");
import * as fs from "fs";
import { join } from "path";
import { PassThrough } from "stream";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  createRandomLocalFile,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  readStreamToLocalFile,
  rmRecursive
} from "../testutils";

// Set true to enable debug log
configLogger(false);

// tslint:disable:no-empty
describe("BlockBlobHighlevel", () => {
  const factory = new BlobTestServerFactory();
  // Loose model to bypass if-match header used by download retry
  const server = factory.createServer(true);

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

  let containerName = getUniqueName("container");
  let containerClient = serviceClient.getContainerClient(containerName);
  let blobName = getUniqueName("blob");
  let blobClient = containerClient.getBlobClient(blobName);
  let blockBlobClient = blobClient.getBlockBlobClient();
  let tempFileSmall: string;
  let tempFileSmallLength: number;
  let tempFileLarge: string;
  let tempFileLargeLength: number;
  const tempFolderPath = "temp";
  const timeoutForLargeFileUploadingTest = 20 * 60 * 1000;

  beforeEach(async () => {
    containerName = getUniqueName("container");
    containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();
    blobName = getUniqueName("blob");
    blobClient = containerClient.getBlobClient(blobName);
    blockBlobClient = blobClient.getBlockBlobClient();
  });

  afterEach(async function () {
    await containerClient.delete();
  });

  before(async () => {
    await server.start();

    if (!fs.existsSync(tempFolderPath)) {
      fs.mkdirSync(tempFolderPath);
    }
    tempFileLarge = await createRandomLocalFile(
      tempFolderPath,
      8224,
      1024 * 32
    );
    tempFileLargeLength = 257 * 1024 * 1024;
    tempFileSmall = await createRandomLocalFile(
      tempFolderPath,
      480,
      1024 * 32
    );
    tempFileSmallLength = 15 * 1024 * 1024;
  });

  after(async () => {
    // TODO: Find out reason of slow close
    await server.close();
    fs.unlinkSync(tempFileLarge);
    fs.unlinkSync(tempFileSmall);
    await rmRecursive(tempFolderPath);
    // TODO: Find out reason of slow clean up
    await server.clean();
  });

  it("uploadFile should success when blob >= BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES @loki @sql", async () => {
    const result = await blockBlobClient.uploadFile(tempFileLarge, {
      blockSize: 4 * 1024 * 1024,
      concurrency: 20
    });
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const downloadResponse = await blockBlobClient.download(0);
    const downloadedFile = join(tempFolderPath, getUniqueName("downloadfile."));
    await readStreamToLocalFile(
      downloadResponse.readableStreamBody!,
      downloadedFile
    );

    const downloadedData = await fs.readFileSync(downloadedFile);
    const uploadedData = await fs.readFileSync(tempFileLarge);

    fs.unlinkSync(downloadedFile);
    assert.ok(downloadedData.equals(uploadedData));
  }).timeout(timeoutForLargeFileUploadingTest);

  it("uploadFile should success when blob < BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES @loki @sql", async () => {
    await blockBlobClient.uploadFile(tempFileSmall, {
      blockSize: 4 * 1024 * 1024,
      concurrency: 20
    });

    const downloadResponse = await blockBlobClient.download(0);
    const downloadedFile = join(tempFolderPath, getUniqueName("downloadfile."));
    await readStreamToLocalFile(
      downloadResponse.readableStreamBody!,
      downloadedFile
    );

    const downloadedData = await fs.readFileSync(downloadedFile);
    const uploadedData = await fs.readFileSync(tempFileSmall);

    fs.unlinkSync(downloadedFile);
    assert.ok(downloadedData.equals(uploadedData));
  });

  // tslint:disable-next-line:max-line-length
  it("uploadFile should success when blob < BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES and configured maxSingleShotSize @loki @sql", async () => {
    await blockBlobClient.uploadFile(tempFileSmall, {
      maxSingleShotSize: 0
    });

    const downloadResponse = await blockBlobClient.download(0);
    const downloadedFile = join(tempFolderPath, getUniqueName("downloadfile."));
    await readStreamToLocalFile(
      downloadResponse.readableStreamBody!,
      downloadedFile
    );

    const downloadedData = await fs.readFileSync(downloadedFile);
    const uploadedData = await fs.readFileSync(tempFileSmall);

    fs.unlinkSync(downloadedFile);
    assert.ok(downloadedData.equals(uploadedData));
  });

  // tslint:disable-next-line: max-line-length
  it("uploadFile should update progress when blob >= BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES @loki @sql", async () => {
    let eventTriggered = false;
    const aborter = new AbortController();

    try {
      await blockBlobClient.uploadFile(tempFileLarge, {
        blockSize: 4 * 1024 * 1024,
        concurrency: 20,
        onProgress: (ev: any) => {
          assert.ok(ev.loadedBytes);
          eventTriggered = true;
          aborter.abort();
        }
      });
    } catch (err) {}
    assert.ok(eventTriggered);
  }).timeout(timeoutForLargeFileUploadingTest);

  // tslint:disable-next-line: max-line-length
  it("uploadFile should update progress when blob < BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES @loki @sql", async () => {
    let eventTriggered = false;
    const aborter = new AbortController();

    try {
      await blockBlobClient.uploadFile(tempFileSmall, {
        blockSize: 4 * 1024 * 1024,
        concurrency: 20,
        onProgress: (ev: any) => {
          assert.ok(ev.loadedBytes);
          eventTriggered = true;
          aborter.abort();
        }
      });
    } catch (err) {}
    assert.ok(eventTriggered);
  });

  it("uploadStream should success @loki @sql", async () => {
    const rs = fs.createReadStream(tempFileLarge);
    const result = await blockBlobClient.uploadStream(rs, 4 * 1024 * 1024, 20);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const downloadResponse = await blockBlobClient.download(0);

    const downloadFilePath = join(
      tempFolderPath,
      getUniqueName("downloadFile")
    );
    await readStreamToLocalFile(
      downloadResponse.readableStreamBody!,
      downloadFilePath
    );

    const downloadedBuffer = fs.readFileSync(downloadFilePath);
    const uploadedBuffer = fs.readFileSync(tempFileLarge);
    assert.ok(uploadedBuffer.equals(downloadedBuffer));

    fs.unlinkSync(downloadFilePath);
  });

  it("uploadStream should success for tiny buffers @loki @sql", async () => {
    const buf = Buffer.from([0x62, 0x75, 0x66, 0x66, 0x65, 0x72]);
    const bufferStream = new PassThrough();
    bufferStream.end(buf);

    await blockBlobClient.uploadStream(bufferStream, 4 * 1024 * 1024, 20);

    const downloadResponse = await blockBlobClient.download(0);

    const downloadFilePath = join(
      tempFolderPath,
      getUniqueName("downloadFile")
    );
    await readStreamToLocalFile(
      downloadResponse.readableStreamBody!,
      downloadFilePath
    );

    const downloadedBuffer = fs.readFileSync(downloadFilePath);
    assert.ok(buf.equals(downloadedBuffer));

    fs.unlinkSync(downloadFilePath);
  });

  it("uploadStream should abort @loki @sql", async () => {
    const rs = fs.createReadStream(tempFileLarge);

    try {
      await blockBlobClient.uploadStream(rs, 4 * 1024 * 1024, 20, {
        abortSignal: AbortController.timeout(1)
      });
      assert.fail();
    } catch (err:any) {
      assert.ok((err.message as string).toLowerCase().includes("abort"));
    }
  }).timeout(timeoutForLargeFileUploadingTest);

  it("uploadStream should update progress event @loki @sql", async () => {
    const rs = fs.createReadStream(tempFileLarge);
    let eventTriggered = false;

    await blockBlobClient.uploadStream(rs, 4 * 1024 * 1024, 20, {
      onProgress: (ev: any) => {
        assert.ok(ev.loadedBytes);
        eventTriggered = true;
      }
    });
    assert.ok(eventTriggered);
  }).timeout(timeoutForLargeFileUploadingTest);

  it("downloadToBuffer should success @loki @sql", async () => {
    const rs = fs.createReadStream(tempFileLarge);
    const result = await blockBlobClient.uploadStream(rs, 4 * 1024 * 1024, 20);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const buf = Buffer.alloc(tempFileLargeLength);
    await blockBlobClient.downloadToBuffer(buf, 0, undefined, {
      blockSize: 4 * 1024 * 1024,
      maxRetryRequestsPerBlock: 5,
      concurrency: 20
    });

    const localFileContent = fs.readFileSync(tempFileLarge);
    assert.ok(localFileContent.equals(buf));
  }).timeout(timeoutForLargeFileUploadingTest);

  it("downloadToBuffer should update progress event @loki @sql", async () => {
    const rs = fs.createReadStream(tempFileSmall);
    await blockBlobClient.uploadStream(rs, 4 * 1024 * 1024, 10);

    let eventTriggered = false;
    const buf = Buffer.alloc(tempFileSmallLength);
    const aborter = new AbortController();
    try {
      await blockBlobClient.downloadToBuffer(buf, 0, undefined, {
        blockSize: 1 * 1024,
        maxRetryRequestsPerBlock: 5,
        concurrency: 1,
        onProgress: () => {
          eventTriggered = true;
          aborter.abort();
        }
      });
    } catch (err) {}
    assert.ok(eventTriggered);
  }).timeout(timeoutForLargeFileUploadingTest);

  it("blobclient.download should success when internal stream unexpected ends at the stream end @loki @sql", async () => {
    await blockBlobClient.uploadFile(tempFileSmall, {
      blockSize: 4 * 1024 * 1024,
      concurrency: 20
    });

    let retirableReadableStreamOptions: any;
    const downloadResponse = await blockBlobClient.download(0, undefined, {
      conditions: {
        // modifiedAccessConditions: {
        //   ifMatch: uploadResponse.eTag
        // }
      },
      maxRetryRequests: 1,
      onProgress: (ev) => {
        if (ev.loadedBytes >= tempFileSmallLength) {
          retirableReadableStreamOptions.doInjectErrorOnce = true;
        }
      }
    });
    assert.equal(
      downloadResponse._response.request.headers.get("x-ms-client-request-id"),
      downloadResponse.clientRequestId
    );

    retirableReadableStreamOptions = (downloadResponse.readableStreamBody! as any)
      .options;

    const downloadedFile = join(tempFolderPath, getUniqueName("downloadfile."));
    await readStreamToLocalFile(
      downloadResponse.readableStreamBody!,
      downloadedFile
    );

    const downloadedData = await fs.readFileSync(downloadedFile);
    const uploadedData = await fs.readFileSync(tempFileSmall);

    fs.unlinkSync(downloadedFile);
    assert.ok(downloadedData.equals(uploadedData));
  });

  // tslint:disable-next-line: max-line-length
  it("blobclient.download should download full data successfully when internal stream unexpected ends @loki @sql", async () => {
    await blockBlobClient.uploadFile(tempFileSmall, {
      blockSize: 4 * 1024 * 1024,
      concurrency: 20
    });

    let retirableReadableStreamOptions: any;
    let injectedErrors = 0;
    const downloadResponse = await blockBlobClient.download(0, undefined, {
      conditions: {
        // modifiedAccessConditions: {
        //   ifMatch: uploadResponse.eTag
        // }
      },
      maxRetryRequests: 3,
      onProgress: () => {
        if (injectedErrors++ < 3) {
          retirableReadableStreamOptions.doInjectErrorOnce = true;
        }
      }
    });

    retirableReadableStreamOptions = (downloadResponse.readableStreamBody! as any)
      .options;

    const downloadedFile = join(tempFolderPath, getUniqueName("downloadfile."));
    await readStreamToLocalFile(
      downloadResponse.readableStreamBody!,
      downloadedFile
    );

    const downloadedData = await fs.readFileSync(downloadedFile);
    const uploadedData = await fs.readFileSync(tempFileSmall);

    fs.unlinkSync(downloadedFile);
    assert.ok(downloadedData.equals(uploadedData));
  });

  it("blobclient.download should download partial data when internal stream unexpected ends @loki @sql", async () => {
    await blockBlobClient.uploadFile(tempFileSmall, {
      blockSize: 4 * 1024 * 1024,
      concurrency: 20
    });

    const partialSize = 500 * 1024;

    let retirableReadableStreamOptions: any;
    let injectedErrors = 0;
    const downloadResponse = await blockBlobClient.download(0, partialSize, {
      conditions: {
        // modifiedAccessConditions: {
        //   ifMatch: uploadResponse.eTag
        // }
      },
      maxRetryRequests: 3,
      onProgress: () => {
        if (injectedErrors++ < 3) {
          retirableReadableStreamOptions.doInjectErrorOnce = true;
        }
      }
    });

    retirableReadableStreamOptions = (downloadResponse.readableStreamBody! as any)
      .options;

    const downloadedFile = join(tempFolderPath, getUniqueName("downloadfile."));
    await readStreamToLocalFile(
      downloadResponse.readableStreamBody!,
      downloadedFile
    );

    const downloadedData = await fs.readFileSync(downloadedFile);
    const uploadedData = await fs.readFileSync(tempFileSmall);

    fs.unlinkSync(downloadedFile);
    assert.ok(
      downloadedData
        .slice(0, partialSize)
        .equals(uploadedData.slice(0, partialSize))
    );
  });

  it("blobclient.download should download data failed when exceeding max stream retry requests @loki @sql", async () => {
    await blockBlobClient.uploadFile(tempFileSmall, {
      blockSize: 4 * 1024 * 1024,
      concurrency: 20
    });

    const downloadedFile = join(tempFolderPath, getUniqueName("downloadfile."));

    let retirableReadableStreamOptions: any;
    let injectedErrors = 0;
    let expectedError = false;

    try {
      const downloadResponse = await blockBlobClient.download(0, undefined, {
        conditions: {
          // modifiedAccessConditions: {
          //   ifMatch: uploadResponse.eTag
          // }
        },
        maxRetryRequests: 0,
        onProgress: () => {
          if (injectedErrors++ < 1) {
            retirableReadableStreamOptions.doInjectErrorOnce = true;
          }
        }
      });
      retirableReadableStreamOptions = (downloadResponse.readableStreamBody! as any)
        .options;
      await readStreamToLocalFile(
        downloadResponse.readableStreamBody!,
        downloadedFile
      );
    } catch (error) {
      expectedError = true;
    }

    assert.ok(expectedError);
    rmRecursive(downloadedFile);
  });
});
