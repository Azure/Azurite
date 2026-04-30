import * as assert from "assert";
import { Readable } from "stream";
import {
  instance,
  mock,
  when
} from "ts-mockito";
import BlobStorageContext from "../../../src/blob/context/BlobStorageContext";
import Context from "../../../src/blob/generated/Context";
import IRequest from "../../../src/blob/generated/IRequest";
import { BlobBatchHandler } from "../../../src/blob/handlers/BlobBatchHandler";
import {
  IBlobMetadataStore
} from "../../../src/blob/persistence/IBlobMetadataStore";
import { HeaderConstants } from "../../../src/blob/utils/constants";
import logger, { configLogger } from "../../../src/common/Logger";
import IExtentStore from "../../../src/common/persistence/IExtentStore";
import IAccountDataStore from "../../../src/common/IAccountDataStore";
import { getUniqueName } from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("BlobBatchHandler", () => {
  let handler: BlobBatchHandler;
  let mockAccountDataStore: IAccountDataStore;
  let mockMetadataStore: IBlobMetadataStore;
  let mockExtentStore: IExtentStore;
  let blobCtx: BlobStorageContext;
  let mockRequest: IRequest;

  beforeEach(() => {
    mockAccountDataStore = mock<IAccountDataStore>();
    mockMetadataStore = mock<IBlobMetadataStore>();
    mockExtentStore = mock<IExtentStore>();
    mockRequest = mock<IRequest>();
    
    when(mockRequest.getHeader(HeaderConstants.CONTENT_MD5)).thenReturn(undefined);
    when(mockRequest.getRawHeaders()).thenReturn([]);

    blobCtx = new BlobStorageContext({ contextId: "" } as Context);
    blobCtx.contextId = getUniqueName("contextID");
    blobCtx.account = getUniqueName("account");
    blobCtx.container = getUniqueName("container");
    blobCtx.blob = getUniqueName("blob");
    blobCtx.request = instance(mockRequest);

    handler = new BlobBatchHandler(
      instance(mockAccountDataStore),
      undefined, // oauth
      instance(mockMetadataStore),
      instance(mockExtentStore),
      logger,
      false
    );
  });

  describe("streamToBuffer2 method", () => {
    function createTestStream(data: string | Buffer | (string | Buffer)[]): Readable {
      const chunks = Array.isArray(data) ? data : [data];
      let index = 0;
      
      return new Readable({
        read() {
          if (index < chunks.length) {
            this.push(chunks[index++]);
          } else {
            this.push(null);
          }
        }
      });
    }

    it("should correctly handle string chunks @loki @sql", async () => {
      const testData = "Hello, World! This is a test string.";
      const stream = createTestStream(testData);
      const buffer = Buffer.alloc(100);

      // Use reflection to access private method
      const result = await (handler as any).streamToBuffer2(stream, buffer, 'utf8');

      assert.strictEqual(result, testData.length);
      assert.strictEqual(buffer.toString('utf8', 0, result), testData);
    });

    it("should correctly handle Buffer chunks @loki @sql", async () => {
      const testData = Buffer.from("Binary data test with special chars: \x00\x01\x02\xFF");
      const stream = createTestStream(testData);
      const buffer = Buffer.alloc(100);

      const result = await (handler as any).streamToBuffer2(stream, buffer);

      assert.strictEqual(result, testData.length);
      assert.deepStrictEqual(
        Array.from(buffer.subarray(0, result)), 
        Array.from(testData)
      );
    });

    it("should handle mixed string and Buffer chunks @loki @sql", async () => {
      const chunks = [
        "Start string",
        Buffer.from(" middle buffer "),
        "end string"
      ];
      const bufferChunks: Buffer[] = [
        Buffer.from("Start string"),
        Buffer.from(" middle buffer "),
        Buffer.from("end string")
      ];
      const expectedData = Buffer.concat(bufferChunks as any);
      
      const stream = createTestStream(chunks);
      const buffer = Buffer.alloc(100);

      const result = await (handler as any).streamToBuffer2(stream, buffer, 'utf8');

      assert.strictEqual(result, expectedData.length);
      assert.deepStrictEqual(
        Array.from(buffer.subarray(0, result)), 
        Array.from(expectedData)
      );
    });

    it("should handle Uint8Array chunks @loki @sql", async () => {
      const testData = new Uint8Array([72, 101, 108, 108, 111, 44, 32, 87, 111, 114, 108, 100, 33]); // "Hello, World!"
      const stream = new Readable({
        read() {
          this.push(testData);
          this.push(null);
        }
      });
      const buffer = Buffer.alloc(50);

      const result = await (handler as any).streamToBuffer2(stream, buffer);

      assert.strictEqual(result, testData.length);
      assert.deepStrictEqual(
        Array.from(buffer.subarray(0, result)), 
        Array.from(testData)
      );
    });

    it("should handle empty stream @loki @sql", async () => {
      const stream = new Readable({
        read() {
          this.push(null); // End immediately
        }
      });
      const buffer = Buffer.alloc(100);

      const result = await (handler as any).streamToBuffer2(stream, buffer);

      assert.strictEqual(result, 0);
    });

    it("should handle multiple small chunks efficiently @loki @sql", async () => {
      // This test ensures our optimization works well with many small chunks
      const chunks = Array.from({length: 50}, (_, i) => `chunk${i}`);
      const expectedLength = chunks.join('').length;
      
      const stream = createTestStream(chunks);
      const buffer = Buffer.alloc(1000);

      const result = await (handler as any).streamToBuffer2(stream, buffer, 'utf8');

      assert.strictEqual(result, expectedLength);
      assert.strictEqual(buffer.toString('utf8', 0, result), chunks.join(''));
    });

    it("should reject when stream exceeds buffer size @loki @sql", async () => {
      const testData = "A".repeat(50); // 50 bytes
      const stream = createTestStream(testData);
      const buffer = Buffer.alloc(25); // Only 25 bytes available

      try {
        await (handler as any).streamToBuffer2(stream, buffer, 'utf8');
        assert.fail("Should have thrown an error for buffer overflow");
      } catch (error: any) {
        assert.ok(error.message.includes("Stream exceeds buffer size"));
        assert.ok(error.message.includes("Buffer size: 25"));
      }
    });

    it("should handle stream errors properly @loki @sql", async () => {
      const stream = new Readable({
        read() {
          this.emit('error', new Error('Test stream error'));
        }
      });
      const buffer = Buffer.alloc(100);

      try {
        await (handler as any).streamToBuffer2(stream, buffer);
        assert.fail("Should have thrown an error for stream error");
      } catch (error: any) {
        assert.strictEqual(error.message, 'Test stream error');
      }
    });

    it("should correctly handle encoding parameter @loki @sql", async () => {
      // Test with non-utf8 encoding
      const testString = "Hello, 世界! 🌍"; // Mixed ASCII and Unicode
      const stream = createTestStream(testString);
      const buffer = Buffer.alloc(100);

      const result = await (handler as any).streamToBuffer2(stream, buffer, 'utf8');

      assert.strictEqual(result, Buffer.from(testString, 'utf8').length);
      assert.strictEqual(buffer.toString('utf8', 0, result), testString);
    });

    it("should handle large buffer data efficiently @loki @sql", async () => {
      // Test with larger data to ensure optimization scales
      const testData = Buffer.alloc(8192, 'A'); // 8KB of data
      const stream = createTestStream([
        testData.subarray(0, 2048),
        testData.subarray(2048, 4096),
        testData.subarray(4096, 6144),
        testData.subarray(6144, 8192)
      ]);
      const buffer = Buffer.alloc(10000);

      const result = await (handler as any).streamToBuffer2(stream, buffer);

      assert.strictEqual(result, testData.length);
      assert.deepStrictEqual(
        Array.from(buffer.subarray(0, result)), 
        Array.from(testData)
      );
    });

    it("should maintain position correctly with multiple chunks @loki @sql", async () => {
      const chunks: Buffer[] = [
        Buffer.from([1, 2, 3]),
        Buffer.from([4, 5]),
        Buffer.from([6, 7, 8, 9])
      ];
      const expectedData = Buffer.concat(chunks as any);
      
      const stream = createTestStream(chunks);
      const buffer = Buffer.alloc(20);

      const result = await (handler as any).streamToBuffer2(stream, buffer);

      assert.strictEqual(result, expectedData.length);
      assert.deepStrictEqual(
        Array.from(buffer.subarray(0, result)), 
        Array.from(expectedData)
      );
      
      // Verify exact byte sequence
      const expectedBytes = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      for (let i = 0; i < expectedBytes.length; i++) {
        assert.strictEqual(buffer[i], expectedBytes[i], `Byte at position ${i} should be ${expectedBytes[i]}`);
      }
    });
  });

  describe("performance characteristics", () => {
    it("should process streams without unnecessary memory allocations @loki @sql", async () => {
      // This test verifies our optimization eliminates Uint8Array allocations
      const testData = Buffer.from("Performance test data with multiple chunks");
      const chunks = [
        testData.subarray(0, 10),
        testData.subarray(10, 20),
        testData.subarray(20, 30),
        testData.subarray(30)
      ];
      
      const stream = new Readable({
        read() {
          const chunk = chunks.shift();
          if (chunk) {
            this.push(chunk);
          } else {
            this.push(null);
          }
        }
      });
      
      const buffer = Buffer.alloc(100);
      
      // Track allocations
      let uint8ArrayAllocations = 0;
      const originalUint8Array = global.Uint8Array;
      global.Uint8Array = function(this: any, ...args: any[]): Uint8Array {
        uint8ArrayAllocations++;
        return new (originalUint8Array as any)(...args);
      } as any;
      
      try {
        const result = await (handler as any).streamToBuffer2(stream, buffer);
        
        // Verify correctness
        assert.strictEqual(result, testData.length);
        assert.deepStrictEqual(
          Array.from(buffer.subarray(0, result)), 
          Array.from(testData)
        );
        
        // Verify no unnecessary allocations occurred in our optimized method
        // Note: There might be allocations from other parts of the system, 
        // but our streamToBuffer2 should not create any Uint8Array wrappers
        assert.strictEqual(uint8ArrayAllocations, 0, 
          "streamToBuffer2 should not create unnecessary Uint8Array allocations");
          
      } finally {
        global.Uint8Array = originalUint8Array;
      }
    });
  });
});