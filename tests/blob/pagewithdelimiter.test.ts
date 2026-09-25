import * as assert from "assert";
import { BlobPrefixModel } from "../../src/blob/persistence/IBlobMetadataStore";
import {
  BlobListMarkerTuple,
  compareBlobListMarkerTuples,
  decodeBlobListMarker,
  encodeBlobListMarker,
  isLegacyBlobListMarker,
  toBlobListMarkerTuple
} from "../../src/blob/persistence/BlobListMarker";
import PageWithDelimiter from "../../src/blob/persistence/PageWithDelimiter";

describe("PageWithDelimiter", () => {
  function checkResult(
    items: string[],
    prefixes: BlobPrefixModel[],
    marker: string,
    expected_items_count: number,
    expected_prefixes_count: number,
    expected_marker_name: string
  ): void {
    assert.equal(items.length, expected_items_count);
    assert.equal(prefixes.length, expected_prefixes_count);
    assertMarkerName(marker, expected_marker_name);
  }

  // Continuation tokens are opaque, so assert on the decoded name and check
  // that the token is not simply the blob name.
  function assertMarkerName(marker: string, expected_name: string): void {
    if (expected_name === "") {
      assert.strictEqual(marker, "");
      return;
    }
    assert.notStrictEqual(marker, expected_name);
    assert.strictEqual(decodeBlobListMarker(marker).name, expected_name);
  }

  // a namer is used by fill, the record id makes each item uniquely ordered
  const createNamer = (): ((i: string) => BlobListMarkerTuple) => {
    let recordId = 0;
    return (i: string) => [i, "", ++recordId];
  };
  const namer = createNamer();
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
      checkResult(items, prefixes, marker, 1, 0, "a");
    });

    it("fills n results properly @loki", async () => {
      const page = new PageWithDelimiter<string>(5);
      const [items, prefixes, marker] = await page.fill(createReader(blobs, 5), namer);
      checkResult(items, prefixes, marker, 5, 0, "c/sub/1");
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

    it("pages deterministically when names are duplicated @loki", async () => {
      const page = new PageWithDelimiter<string>(2);
      const [items, prefixes, marker] = await page.fill(
        createReader(["a", "a", "b"], 2),
        namer
      );

      checkResult(items, prefixes, marker, 2, 0, "a");
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
        checkResult(items, prefixes, marker, 1, 0, "a");

        // now cut off the end of the array and ensure no continuation is returned
        page.reset();
        [items, prefixes, marker] = await page.fill(createReader(blobs.slice(1), 1), namer);
        checkResult(items, prefixes, marker, 1, 0, "");
      });

      it("returns first item when prefixes exist @loki", async () => {
        const blobs = ["a/1", "a/2", "a/3", "a/sub/1"];
        const page = new PageWithDelimiter<string>(1, "/", "a/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 1), namer);
        checkResult(items, prefixes, marker, 1, 0, "a/1");
      });

      it("returns first prefix when blobs exist @loki", async () => {
        const blobs = ["a/s0/1", "a/s0/2", "a/s0/3", "a/s1/1", "a/s2/2", "a/z"];
        const page = new PageWithDelimiter<string>(1, "/", "a/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 1), namer);
        checkResult(items, prefixes, marker, 0, 1, "a/s0/3");
      });
    });

    describe("multiple item page size", () => {

      it("squashes prefixes @loki", async () => {
        const blobs = ["a/s0/1", "a/s0/2", "a/s0/3", "a/s1/1", "a/s1/2", "a/s2/2", "a/z"];
        const page = new PageWithDelimiter<string>(2, "/", "a/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 2), namer);
        checkResult(items, prefixes, marker, 0, 2, "a/s1/2");
      });

      it("squashes a mix @loki", async () => {
        const blobs = ["a/a", "a/s0/1", "a/s0/2", "a/s1/1", "a/s1/2", "a/z"];
        const page = new PageWithDelimiter<string>(2, "/", "a/");
        const [items, prefixes, marker] = await page.fill(createReader(blobs, 2), namer);
        checkResult(items, prefixes, marker, 1, 1, "a/s0/2");
      });

      it("follows squashed pages @loki", async () => {
        const blobs = ["a/a", "a/s0/1", "a/s0/2", "a/s1/1", "a/s1/2", "a/z"];
        const page = new PageWithDelimiter<string>(2, "/", "a/");
        let [items, prefixes, marker] = await page.fill(createReader(blobs, 2), namer);
        checkResult(items, prefixes, marker, 1, 1, "a/s0/2");

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

    // Namer that extracts the [name, timestamp, recordId] tuple like the real
    // implementation
    let versioningRecordId = 0;
    const versioningNamer = (blob: MockVersionedBlob): BlobListMarkerTuple => {
      const recordId = ++versioningRecordId;
      // Snapshot: use snapshot timestamp
      if (blob.snapshot && blob.snapshot.length > 0) {
        return [blob.name, blob.snapshot, recordId];
      }
      // Versioned blob: use versionId timestamp
      if (blob.versionId && blob.versionId.length > 0) {
        return [blob.name, blob.versionId, recordId];
      }
      // Non-versioned blob: use lastModified timestamp
      return [
        blob.name,
        blob.lastModified || "2023-01-01T00:00:00.000Z",
        recordId
      ];
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
      expected_marker_name: string,
      expected_marker_timestamp: string = ""
    ): void {
      assert.equal(items.length, expected_items_count);
      assert.equal(prefixes.length, expected_prefixes_count);
      assertMarkerName(marker, expected_marker_name);
      if (expected_marker_name !== "") {
        assert.strictEqual(
          decodeBlobListMarker(marker).timestamp,
          expected_marker_timestamp
        );
      }
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
        "blob1", "2023-01-01T11:00:00.000Z");
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
        "blob1", "2023-01-01T10:30:00.0000000Z");
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
        "blob1", "2023-01-01T12:00:00.0000000Z");
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
        "blob1", "2023-01-01T11:00:00.000Z");

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
        "folder/blob1", "2023-01-01T11:00:00.000Z");
    });
  });

  describe("marker encoding", () => {
    it("round trips the full ordering tuple @loki", () => {
      const marker = encodeBlobListMarker("blob1", "2023-01-01T11:00:00.000Z", 7);
      assert.deepStrictEqual(decodeBlobListMarker(marker), {
        v: 1,
        name: "blob1",
        timestamp: "2023-01-01T11:00:00.000Z",
        recordId: 7
      });
    });

    it("is opaque and base64url safe @loki", () => {
      // names chosen to produce '+' and '/' under standard base64
      for (const name of ["a/b?c", "\u00ff\u00fe", "blob~name", "a".repeat(40)]) {
        const marker = encodeBlobListMarker(name, "2023-01-01T11:00:00.000Z", 1);
        assert.notStrictEqual(marker, name);
        assert.ok(
          /^[A-Za-z0-9_-]+$/.test(marker),
          `marker is not base64url safe: ${marker}`
        );
        assert.strictEqual(decodeBlobListMarker(marker).name, name);
      }
    });

    it("survives a query string round trip @loki", () => {
      const marker = encodeBlobListMarker("blob1", "2023-01-01T11:00:00.000Z", 3);
      const roundTripped = new URLSearchParams(
        `marker=${marker}`
      ).get("marker")!;
      assert.strictEqual(roundTripped, marker);
      assert.strictEqual(decodeBlobListMarker(roundTripped).name, "blob1");
    });

    it("treats an empty or missing marker as no marker @loki", () => {
      for (const marker of ["", undefined]) {
        assert.deepStrictEqual(decodeBlobListMarker(marker), {
          v: 1,
          name: "",
          timestamp: "",
          recordId: -1
        });
      }
    });

    it("treats unrecognized markers as legacy plain blob names @loki", () => {
      const legacy = decodeBlobListMarker("folder/blob1");
      assert.strictEqual(legacy.name, "folder/blob1");
      assert.ok(isLegacyBlobListMarker(legacy));

      // structurally valid encodings which are not v1 markers
      const rejected = [
        JSON.stringify([1, 2]),
        JSON.stringify({ name: "a", timestamp: "", recordId: 1 }),
        JSON.stringify({ v: 2, name: "a", timestamp: "", recordId: 1 }),
        JSON.stringify({ v: 1, name: 1, timestamp: "", recordId: 1 }),
        JSON.stringify({ v: 1, name: "a", timestamp: 1, recordId: 1 }),
        JSON.stringify({ v: 1, name: "a", timestamp: "", recordId: "1" }),
        JSON.stringify({ v: 1, name: "a", timestamp: "", recordId: 1.5 })
      ].map((json) => Buffer.from(json, "utf8").toString("base64url"));

      for (const marker of rejected) {
        const decoded = decodeBlobListMarker(marker);
        assert.strictEqual(decoded.name, marker);
        assert.ok(isLegacyBlobListMarker(decoded));
      }
    });

    it("skips a whole name for a legacy marker @loki", () => {
      const legacy = toBlobListMarkerTuple(decodeBlobListMarker("blob1"));

      // every record of blob1 has already been returned
      assert.strictEqual(
        PageWithDelimiter.isMarkerLater(["blob1", "2099-01-01T00:00:00.000Z", 9], legacy),
        false
      );
      assert.strictEqual(
        PageWithDelimiter.isMarkerLater(["blob2", "", 0], legacy),
        true
      );
    });

    it("uses a record id which cannot collide with a real record @loki", () => {
      // Record ids are store assigned auto-increment identities, so a negative
      // sentinel is unreachable by a real record.
      const legacy = decodeBlobListMarker("blob1");
      assert.ok(legacy.recordId < 0);
    });

    it("compares ordinally rather than by locale collation @loki", () => {
      // The marker filter and the store sort must agree. localeCompare orders
      // "A" after "a" under a default collation, ordinal comparison does not.
      assert.ok(compareBlobListMarkerTuples(["A", "", 0], ["a", "", 0]) < 0);
      assert.ok(compareBlobListMarkerTuples(["a", "", 0], ["A", "", 0]) > 0);
      assert.ok(
        compareBlobListMarkerTuples(
          ["b", "2023-01-01T10:00:00.000Z", 0],
          ["b", "2023-01-01t10:00:00.000Z", 0]
        ) < 0
      );
    });
  });

  describe("deterministic paging", () => {
    // Records sharing a name and a timestamp are only separable by record id.
    const collidingNamer = (item: [string, string, number]): BlobListMarkerTuple =>
      item;
    const records: [string, string, number][] = [
      ["blob1", "2023-01-01T10:00:00.000Z", 1],
      ["blob1", "2023-01-01T10:00:00.000Z", 2],
      ["blob1", "2023-01-01T10:00:00.000Z", 3],
      ["blob2", "2023-01-01T10:00:00.000Z", 4]
    ];

    it("returns every record exactly once across pages @loki", async () => {
      const seen: [string, string, number][] = [];
      let marker = "";

      for (let guard = 0; guard < 10; guard++) {
        const tuple = toBlobListMarkerTuple(decodeBlobListMarker(marker));
        const remaining = records.filter((record) =>
          PageWithDelimiter.isMarkerLater(collidingNamer(record), tuple)
        );

        const page = new PageWithDelimiter<[string, string, number]>(2);
        const [items, , nextMarker] = await page.fill(
          (offset: number) => Promise.resolve(remaining.slice(offset, offset + 2)),
          collidingNamer
        );
        seen.push(...items);
        marker = nextMarker;
        if (marker === "") break;
      }

      assert.strictEqual(marker, "");
      assert.deepStrictEqual(seen, records);
    });

    it("carries the record id in the continuation token @loki", async () => {
      const page = new PageWithDelimiter<[string, string, number]>(2);
      const [, , marker] = await page.fill(
        (offset: number) => Promise.resolve(records.slice(offset, offset + 2)),
        collidingNamer
      );

      assert.deepStrictEqual(decodeBlobListMarker(marker), {
        v: 1,
        name: "blob1",
        timestamp: "2023-01-01T10:00:00.000Z",
        recordId: 2
      });
    });
  });
});
