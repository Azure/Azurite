import {
  Aborter,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  downloadBlobToBuffer,
  ServiceURL,
  SharedKeyCredential,
  StorageURL,
  uploadFileToBlockBlob,
  uploadStreamToBlockBlob
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

  let containerName = getUniqueName("container");
  let containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
  let blobName = getUniqueName("blob");
  let blobURL = BlobURL.fromContainerURL(containerURL, blobName);
  let blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
  let tempFileSmall: string;
  let tempFileSmallLength: number;
  let tempFileLarge: string;
  let tempFileLargeLength: number;
  const tempFolderPath = "temp";

  beforeEach(async () => {
    containerName = getUniqueName("container");
    containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);
    blobName = getUniqueName("blob");
    blobURL = BlobURL.fromContainerURL(containerURL, blobName);
    blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
  });

  afterEach(async () => {
    await containerURL.delete(Aborter.none);
  });

  before(async () => {
    await server.start();

    if (!fs.existsSync(tempFolderPath)) {
      fs.mkdirSync(tempFolderPath);
    }
    tempFileLarge = await createRandomLocalFile(
      tempFolderPath,
      257,
      1024 * 1024
    );
    tempFileLargeLength = 257 * 1024 * 1024;
    tempFileSmall = await createRandomLocalFile(
      tempFolderPath,
      15,
      1024 * 1024
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

  it("uploadFileToBlockBlob should success when blob >= BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES", async () => {
    const result = await uploadFileToBlockBlob(
      Aborter.none,
      tempFileLarge,
      blockBlobURL,
      {
        blockSize: 4 * 1024 * 1024,
        parallelism: 20
      }
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const downloadResponse = await blockBlobURL.download(Aborter.none, 0);
    const downloadedFile = join(tempFolderPath, getUniqueName("downloadfile."));
    await readStreamToLocalFile(
      downloadResponse.readableStreamBody!,
      downloadedFile
    );

    const downloadedData = await fs.readFileSync(downloadedFile);
    const uploadedData = await fs.readFileSync(tempFileLarge);

    fs.unlinkSync(downloadedFile);
    assert.ok(downloadedData.equals(uploadedData));
  });

  it("uploadFileToBlockBlob should success when blob < BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES", async () => {
    await uploadFileToBlockBlob(Aborter.none, tempFileSmall, blockBlobURL, {
      blockSize: 4 * 1024 * 1024,
      parallelism: 20
    });

    const downloadResponse = await blockBlobURL.download(Aborter.none, 0);
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
  it("uploadFileToBlockBlob should success when blob < BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES and configured maxSingleShotSize", async () => {
    await uploadFileToBlockBlob(Aborter.none, tempFileSmall, blockBlobURL, {
      maxSingleShotSize: 0
    });

    const downloadResponse = await blockBlobURL.download(Aborter.none, 0);
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

  it("uploadFileToBlockBlob should update progress when blob >= BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES", async () => {
    let eventTriggered = false;
    const aborter = Aborter.none;

    try {
      await uploadFileToBlockBlob(aborter, tempFileLarge, blockBlobURL, {
        blockSize: 4 * 1024 * 1024,
        parallelism: 20,
        progress: ev => {
          assert.ok(ev.loadedBytes);
          eventTriggered = true;
          aborter.abort();
        }
      });
    } catch (err) {}
    assert.ok(eventTriggered);
  });

  it("uploadFileToBlockBlob should update progress when blob < BLOCK_BLOB_MAX_UPLOAD_BLOB_BYTES", async () => {
    let eventTriggered = false;
    const aborter = Aborter.none;

    try {
      await uploadFileToBlockBlob(aborter, tempFileSmall, blockBlobURL, {
        blockSize: 4 * 1024 * 1024,
        parallelism: 20,
        progress: ev => {
          assert.ok(ev.loadedBytes);
          eventTriggered = true;
          aborter.abort();
        }
      });
    } catch (err) {}
    assert.ok(eventTriggered);
  });

  it("uploadStreamToBlockBlob should success", async () => {
    const rs = fs.createReadStream(tempFileLarge);
    const result = await uploadStreamToBlockBlob(
      Aborter.none,
      rs,
      blockBlobURL,
      4 * 1024 * 1024,
      20
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const downloadResponse = await blockBlobURL.download(Aborter.none, 0);

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

  it("uploadStreamToBlockBlob should success for tiny buffers", async () => {
    const buf = Buffer.from([0x62, 0x75, 0x66, 0x66, 0x65, 0x72]);
    const bufferStream = new PassThrough();
    bufferStream.end(buf);

    await uploadStreamToBlockBlob(
      Aborter.none,
      bufferStream,
      blockBlobURL,
      4 * 1024 * 1024,
      20
    );

    const downloadResponse = await blockBlobURL.download(Aborter.none, 0);

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

  it("uploadStreamToBlockBlob should abort", async () => {
    const rs = fs.createReadStream(tempFileLarge);
    const aborter = Aborter.timeout(1);

    try {
      await uploadStreamToBlockBlob(
        aborter,
        rs,
        blockBlobURL,
        4 * 1024 * 1024,
        20
      );
      assert.fail();
    } catch (err) {
      assert.ok((err.code as string).toLowerCase().includes("abort"));
    }
  });

  it("uploadStreamToBlockBlob should update progress event", async () => {
    const rs = fs.createReadStream(tempFileLarge);
    let eventTriggered = false;

    await uploadStreamToBlockBlob(
      Aborter.none,
      rs,
      blockBlobURL,
      4 * 1024 * 1024,
      20,
      {
        progress: ev => {
          assert.ok(ev.loadedBytes);
          eventTriggered = true;
        }
      }
    );
    assert.ok(eventTriggered);
  });

  it("downloadBlobToBuffer should success", async () => {
    const rs = fs.createReadStream(tempFileLarge);
    const result = await uploadStreamToBlockBlob(
      Aborter.none,
      rs,
      blockBlobURL,
      4 * 1024 * 1024,
      20
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const buf = Buffer.alloc(tempFileLargeLength);
    await downloadBlobToBuffer(Aborter.none, buf, blockBlobURL, 0, undefined, {
      blockSize: 4 * 1024 * 1024,
      maxRetryRequestsPerBlock: 5,
      parallelism: 20
    });

    const localFileContent = fs.readFileSync(tempFileLarge);
    assert.ok(localFileContent.equals(buf));
  });

  it("downloadBlobToBuffer should update progress event", async () => {
    const rs = fs.createReadStream(tempFileSmall);
    await uploadStreamToBlockBlob(
      Aborter.none,
      rs,
      blockBlobURL,
      4 * 1024 * 1024,
      10
    );

    let eventTriggered = false;
    const buf = Buffer.alloc(tempFileSmallLength);
    const aborter = Aborter.none;
    try {
      await downloadBlobToBuffer(aborter, buf, blockBlobURL, 0, undefined, {
        blockSize: 1 * 1024,
        maxRetryRequestsPerBlock: 5,
        parallelism: 1,
        progress: () => {
          eventTriggered = true;
          aborter.abort();
        }
      });
    } catch (err) {}
    assert.ok(eventTriggered);
  });

  it.only("bloburl.download should success when internal stream unexpected ends at the stream end", async () => {
    const uploadResponse = await uploadFileToBlockBlob(
      Aborter.none,
      tempFileSmall,
      blockBlobURL,
      {
        blockSize: 4 * 1024 * 1024,
        parallelism: 20
      }
    );

    let retirableReadableStreamOptions: any;
    const downloadResponse = await blockBlobURL.download(
      Aborter.none,
      0,
      undefined,
      {
        blobAccessConditions: {
          // modifiedAccessConditions: {
          //   ifMatch: uploadResponse.eTag
          // }
        },
        maxRetryRequests: 1,
        progress: ev => {
          if (ev.loadedBytes >= tempFileSmallLength) {
            retirableReadableStreamOptions.doInjectErrorOnce = true;
          }
        }
      }
    );
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

  it("bloburl.download should download full data successfully when internal stream unexpected ends", async () => {
    const uploadResponse = await uploadFileToBlockBlob(
      Aborter.none,
      tempFileSmall,
      blockBlobURL,
      {
        blockSize: 4 * 1024 * 1024,
        parallelism: 20
      }
    );

    let retirableReadableStreamOptions: any;
    let injectedErrors = 0;
    const downloadResponse = await blockBlobURL.download(
      Aborter.none,
      0,
      undefined,
      {
        blobAccessConditions: {
          // modifiedAccessConditions: {
          //   ifMatch: uploadResponse.eTag
          // }
        },
        maxRetryRequests: 3,
        progress: () => {
          if (injectedErrors++ < 3) {
            retirableReadableStreamOptions.doInjectErrorOnce = true;
          }
        }
      }
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

  it("bloburl.download should download partial data when internal stream unexpected ends", async () => {
    const uploadResponse = await uploadFileToBlockBlob(
      Aborter.none,
      tempFileSmall,
      blockBlobURL,
      {
        blockSize: 4 * 1024 * 1024,
        parallelism: 20
      }
    );

    const partialSize = 500 * 1024;

    let retirableReadableStreamOptions: any;
    let injectedErrors = 0;
    const downloadResponse = await blockBlobURL.download(
      Aborter.none,
      0,
      partialSize,
      {
        blobAccessConditions: {
          // modifiedAccessConditions: {
          //   ifMatch: uploadResponse.eTag
          // }
        },
        maxRetryRequests: 3,
        progress: () => {
          if (injectedErrors++ < 3) {
            retirableReadableStreamOptions.doInjectErrorOnce = true;
          }
        }
      }
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
    assert.ok(
      downloadedData
        .slice(0, partialSize)
        .equals(uploadedData.slice(0, partialSize))
    );
  });

  it("bloburl.download should download data failed when exceeding max stream retry requests", async () => {
    const uploadResponse = await uploadFileToBlockBlob(
      Aborter.none,
      tempFileSmall,
      blockBlobURL,
      {
        blockSize: 4 * 1024 * 1024,
        parallelism: 20
      }
    );

    const downloadedFile = join(tempFolderPath, getUniqueName("downloadfile."));

    let retirableReadableStreamOptions: any;
    let injectedErrors = 0;
    let expectedError = false;

    try {
      const downloadResponse = await blockBlobURL.download(
        Aborter.none,
        0,
        undefined,
        {
          blobAccessConditions: {
            // modifiedAccessConditions: {
            //   ifMatch: uploadResponse.eTag
            // }
          },
          maxRetryRequests: 0,
          progress: () => {
            if (injectedErrors++ < 1) {
              retirableReadableStreamOptions.doInjectErrorOnce = true;
            }
          }
        }
      );
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
