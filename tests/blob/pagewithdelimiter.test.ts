import * as assert from "assert";
import { BlobPrefixModel } from "../../src/blob/persistence/IBlobMetadataStore";
import PageWithDelimiter from "../../src/blob/persistence/PageWithDelimiter";

describe("PageWithDelimiter", () => {
  function checkResult(
    items: string[],
    prefixes: BlobPrefixModel[],
    marker: string,
    expected_items_count: number,
    expected_prefixes_count: number,
    expected_marker: string
  ): void {
    assert.equal(items.length, expected_items_count);
    assert.equal(prefixes.length, expected_prefixes_count);
    assert.equal(marker, expected_marker);
  }

  // a namer is used by fill, just return the value for testing
  const namer = (i: string): [string, string] => { return [i, ""]; };
  // return a reader for a list
  const createReader = (items: string[], maxResults: number):
    (o: number) => Promise<string[]> => {
    return (o: number) => { return Promise.resolve(items.slice(o, o + maxResults)); }
  };

  describe("with no delimiter", () => {
    const blobs: string[] = [
      "a",
      "b",
      "c/0",
      "c/1",
      "c/sub/1",
      "d",
      "e/1",
      "e/2"
    ];

    it("handles no blob results @loki", async () => {
      const page = new PageWithDelimiter<string>(5);
      const [items, prefixes, marker] = await page.fill(createReader([], 5), namer);
      checkResult(items, prefixes, marker, 0, 0, "");
    });

    it("fills 1 result properly @loki", async () => {
      const page = new PageWithDelimiter<string>(1);
      const [items, prefixes, marker] = await page.fill(createReader(blobs, 1), namer);
      checkResult(items, prefixes, marker, 1, 0, "a" + PageWithDelimiter.VERSIONING_MARKER);
    });

    it("fills n results properly @loki", async () => {
      const page = new PageWithDelimiter<string>(5);
      const [items, prefixes, marker] = await page.fill(createReader(blobs, 5), namer);
      checkResult(items, prefixes, marker, 5, 0, "c/sub/1" + PageWithDelimiter.VERSIONING_MARKER);
    });

    it("fills exact count with no continuation @loki", async () => {
      const page = new PageWithDelimiter<string>(blobs.length);
      const [items, prefixes, marker] = await page.fill(createReader(blobs, blobs.length), namer);
      checkResult(items, prefixes, marker, blobs.length, 0, "");
    });

    it("fills smaller than max page with no continuation @loki", async () => {
      const page = new PageWithDelimiter<string>(blobs.length + 1);
      const [items, prefixes, marker] = await page.fill(createReader(blobs, blobs.length + 1), namer);
      checkResult(items, prefixes, marker, blobs.length, 0, "");
    });
  });

  describe("with '/' delimiter", () => {

    describe("and 1 item page size", () => {

      it("handles no blob results @loki", async () => {
        const blobs: string[] = [];
        const page = new PageWithDelimiter<string>(1, "/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 1), namer);
        checkResult(items, prefixes, marker, 0, 0, "");
      });

      it("handles 1 blob results @loki", async () => {
        const blobs = ["a"];
        const page = new PageWithDelimiter<string>(1, "/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 1), namer);
        checkResult(items, prefixes, marker, 1, 0, "");
      });

      it("returns 1 of 2 items with proper continuation @loki", async () => {
        const blobs = ["a", "b"];
        const page = new PageWithDelimiter<string>(1, "/");
        let [items, prefixes, marker] = await page.fill(createReader(blobs, 1), namer);
        checkResult(items, prefixes, marker, 1, 0, "a" + PageWithDelimiter.VERSIONING_MARKER);

        // now cut off the end of the array and ensure no continuation is returned
        page.reset();
        [items, prefixes, marker] = await page.fill(createReader(blobs.slice(1), 1), namer);
        checkResult(items, prefixes, marker, 1, 0, "");
      });

      it("returns first item when prefixes exist @loki", async () => {
        const blobs = ["a/1", "a/2", "a/3", "a/sub/1"];
        const page = new PageWithDelimiter<string>(1, "/", "a/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 1), namer);
        checkResult(items, prefixes, marker, 1, 0, "a/1" + PageWithDelimiter.VERSIONING_MARKER);
      });

      it("returns first prefix when blobs exist @loki", async () => {
        const blobs = ["a/s0/1", "a/s0/2", "a/s0/3", "a/s1/1", "a/s2/2", "a/z"];
        const page = new PageWithDelimiter<string>(1, "/", "a/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 1), namer);
        checkResult(items, prefixes, marker, 0, 1, "a/s0/3" + PageWithDelimiter.VERSIONING_MARKER);
      });
    });

    describe("multiple item page size", () => {

      it("squashes prefixes @loki", async () => {
        const blobs = ["a/s0/1", "a/s0/2", "a/s0/3", "a/s1/1", "a/s1/2", "a/s2/2", "a/z"];
        const page = new PageWithDelimiter<string>(2, "/", "a/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 2), namer);
        checkResult(items, prefixes, marker, 0, 2, "a/s1/2" + PageWithDelimiter.VERSIONING_MARKER);
      });

      it("squashes a mix @loki", async () => {
        const blobs = ["a/a", "a/s0/1", "a/s0/2", "a/s1/1", "a/s1/2", "a/z"];
        const page = new PageWithDelimiter<string>(2, "/", "a/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 2), namer);
        checkResult(items, prefixes, marker, 1, 1, "a/s0/2" + PageWithDelimiter.VERSIONING_MARKER);
      });

      it("follows squashed pages @loki", async () => {
        const blobs = ["a/a", "a/s0/1", "a/s0/2", "a/s1/1", "a/s1/2", "a/z"];
        const page = new PageWithDelimiter<string>(2, "/", "a/");
        let [items, prefixes, marker] = await page.fill(createReader(blobs, 2), namer);
        checkResult(items, prefixes, marker, 1, 1, "a/s0/2" + PageWithDelimiter.VERSIONING_MARKER);

        // now cut off the end of the array and ensure no continuation is returned
        page.reset();
        [items, prefixes, marker] = await page.fill(createReader(blobs.slice(3), 2), namer);
        checkResult(items, prefixes, marker, 1, 1, "");
      });

      it("squashes within one larger page @loki", async () => {
        const blobs = ["a/a", "a/s0/1", "a/s0/2", "a/s1/1", "a/s1/2", "a/z"];
        const page = new PageWithDelimiter<string>(4, "/", "a/");
        let [items, prefixes, marker] = await page.fill(createReader(blobs, 4), namer);
        checkResult(items, prefixes, marker, 2, 2, "");
      });
    });
  });

  describe("with versioning scenarios", () => {
    // Mock blob model for testing versioning logic
    interface MockVersionedBlob {
      name: string;
      versionId?: string;
      snapshot?: string;
      lastModified?: string;
    }

    // Namer that extracts name and timestamp tuple like the real implementation
    const versioningNamer = (blob: MockVersionedBlob): [string, string] => {
      // Snapshot: use snapshot timestamp
      if (blob.snapshot && blob.snapshot.length > 0) {
        return [blob.name, blob.snapshot];
      }
      // Versioned blob: use versionId timestamp
      if (blob.versionId && blob.versionId.length > 0) {
        return [blob.name, blob.versionId];
      }
      // Non-versioned blob: use lastModified timestamp
      return [blob.name, blob.lastModified || "2023-01-01T00:00:00.000Z"];
    };

    // Reader for versioned blobs
    const createVersionedReader = (items: MockVersionedBlob[], maxResults: number):
      (o: number) => Promise<MockVersionedBlob[]> => {
      return (o: number) => { return Promise.resolve(items.slice(o, o + maxResults)); }
    };

    // Helper to check versioned results
    function checkVersionedResult(
      items: MockVersionedBlob[],
      prefixes: BlobPrefixModel[],
      marker: string,
      expected_items_count: number,
      expected_prefixes_count: number,
      expected_marker: string
    ): void {
      assert.equal(items.length, expected_items_count);
      assert.equal(prefixes.length, expected_prefixes_count);
      assert.equal(marker, expected_marker);
    }

    it("handles blobs with versionIds @loki", async () => {
      const blobs: MockVersionedBlob[] = [
        { name: "blob1", versionId: "2023-01-01T10:00:00.000Z" },
        { name: "blob1", versionId: "2023-01-01T11:00:00.000Z" },
        { name: "blob2", versionId: "2023-01-01T12:00:00.000Z" }
      ];

      const page = new PageWithDelimiter<MockVersionedBlob>(2);
      const [items, prefixes, marker] = await page.fill(createVersionedReader(blobs, 2), versioningNamer);
      
      checkVersionedResult(items, prefixes, marker, 2, 0, 
        "blob1" + PageWithDelimiter.VERSIONING_MARKER + "2023-01-01T11:00:00.000Z");
    });

    it("handles blobs with snapshots @loki", async () => {
      const blobs: MockVersionedBlob[] = [
        { name: "blob1", lastModified: "2023-01-01T10:00:00.000Z" },
        { name: "blob1", snapshot: "2023-01-01T10:30:00.0000000Z" },
        { name: "blob1", snapshot: "2023-01-01T11:00:00.0000000Z" }
      ];

      const page = new PageWithDelimiter<MockVersionedBlob>(2);
      const [items, prefixes, marker] = await page.fill(createVersionedReader(blobs, 2), versioningNamer);
      
      checkVersionedResult(items, prefixes, marker, 2, 0, 
        "blob1" + PageWithDelimiter.VERSIONING_MARKER + "2023-01-01T10:30:00.0000000Z");
    });

    it("handles mixed versioning types with same name @loki", async () => {
      const blobs: MockVersionedBlob[] = [
        { name: "blob1", lastModified: "2023-01-01T10:00:00.000Z" },
        { name: "blob1", versionId: "2023-01-01T11:00:00.000Z" },
        { name: "blob1", snapshot: "2023-01-01T12:00:00.0000000Z" },
        { name: "blob2", versionId: "2023-01-01T13:00:00.000Z" }
      ];

      const page = new PageWithDelimiter<MockVersionedBlob>(3);
      const [items, prefixes, marker] = await page.fill(createVersionedReader(blobs, 3), versioningNamer);
      
      checkVersionedResult(items, prefixes, marker, 3, 0, 
        "blob1" + PageWithDelimiter.VERSIONING_MARKER + "2023-01-01T12:00:00.0000000Z");
    });

    it("handles different blob names with versions @loki", async () => {
      const blobs: MockVersionedBlob[] = [
        { name: "apple", versionId: "2023-01-01T10:00:00.000Z" },
        { name: "banana", versionId: "2023-01-01T09:00:00.000Z" }, // Earlier timestamp
        { name: "cherry", lastModified: "2023-01-01T11:00:00.000Z" }
      ];

      const page = new PageWithDelimiter<MockVersionedBlob>(10);
      const [items, prefixes, marker] = await page.fill(createVersionedReader(blobs, 10), versioningNamer);
      
      checkVersionedResult(items, prefixes, marker, 3, 0, "");
    });

    it("handles pagination continuation with versioned blobs @loki", async () => {
      const blobs: MockVersionedBlob[] = [
        { name: "blob1", versionId: "2023-01-01T10:00:00.000Z" },
        { name: "blob1", versionId: "2023-01-01T11:00:00.000Z" },
        { name: "blob2", snapshot: "2023-01-01T12:00:00.0000000Z" },
        { name: "blob3", lastModified: "2023-01-01T13:00:00.000Z" }
      ];

      // First page
      const page = new PageWithDelimiter<MockVersionedBlob>(2);
      let [items, prefixes, marker] = await page.fill(createVersionedReader(blobs, 2), versioningNamer);
      
      checkVersionedResult(items, prefixes, marker, 2, 0, 
        "blob1" + PageWithDelimiter.VERSIONING_MARKER + "2023-01-01T11:00:00.000Z");

      // Second page
      page.reset();
      [items, prefixes, marker] = await page.fill(createVersionedReader(blobs.slice(2), 2), versioningNamer);
      
      checkVersionedResult(items, prefixes, marker, 2, 0, "");
    });

    it("handles versioned blobs with delimiter @loki", async () => {
      const blobs: MockVersionedBlob[] = [
        { name: "folder/blob1", versionId: "2023-01-01T10:00:00.000Z" },
        { name: "folder/blob1", versionId: "2023-01-01T11:00:00.000Z" },
        { name: "folder/sub/blob2", snapshot: "2023-01-01T12:00:00.000Z" },
        { name: "folder/blob3", lastModified: "2023-01-01T13:00:00.000Z" }
      ];

      const page = new PageWithDelimiter<MockVersionedBlob>(2, "/", "folder/");
      const [items, prefixes, marker] = await page.fill(createVersionedReader(blobs, 2), versioningNamer);
      
      checkVersionedResult(items, prefixes, marker, 2, 0, 
        "folder/blob1" + PageWithDelimiter.VERSIONING_MARKER + "2023-01-01T11:00:00.000Z");
    });
  });
});
