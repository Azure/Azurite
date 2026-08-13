import * as assert from "assert";
import { BlobPrefixModel } from "../../src/blob/persistence/IBlobMetadataStore";
import PageWithDelimiter, {
  decodePageMarker,
  encodePageMarker,
  isAfterPageMarker
} from "../../src/blob/persistence/PageWithDelimiter";

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
  const namer = (i: string) => { return i; };
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
});

describe("PageWithDelimiter continuation tokens @loki", () => {
  it("encodes a key without a secondary key as the plain blob name", () => {
    // Preserves the historical Azurite token format for listings that do not involve
    // versions, so tokens stay compatible in both directions.
    assert.strictEqual(encodePageMarker(["blob1", ""]), "blob1");
  });

  it("round trips a key with a secondary key", () => {
    const encoded = encodePageMarker(["blob1", "2026-08-13T10:00:00.0000000Z"]);
    assert.notStrictEqual(encoded, "blob1");

    const decoded = decodePageMarker(encoded);
    assert.strictEqual(decoded.name, "blob1");
    assert.strictEqual(decoded.secondaryKey, "2026-08-13T10:00:00.0000000Z");
    assert.strictEqual(decoded.isComposite, true);
  });

  it("round trips names containing awkward characters", () => {
    for (const name of ["a/b c", "a!b", 'quote"name', "2!notatoken", "üñí"]) {
      const decoded = decodePageMarker(encodePageMarker([name, "key"]));
      assert.strictEqual(decoded.name, name);
      assert.strictEqual(decoded.secondaryKey, "key");
    }
  });

  it("treats an unrecognized token as a plain blob name", () => {
    for (const token of ["", "blob1", "2!", "2!not-base64!!", "2!" + Buffer.from('"x"').toString("base64")]) {
      const decoded = decodePageMarker(token);
      assert.strictEqual(decoded.name, token);
      assert.strictEqual(decoded.secondaryKey, "");
      assert.strictEqual(decoded.isComposite, false);
    }
  });

  it("orders items against a plain token by name only", () => {
    const marker = decodePageMarker("blob2");
    assert.strictEqual(isAfterPageMarker(["blob1", ""], marker), false);
    // A plain token means every item sharing the name was already returned
    assert.strictEqual(isAfterPageMarker(["blob2", ""], marker), false);
    assert.strictEqual(isAfterPageMarker(["blob2", "zzz"], marker), false);
    assert.strictEqual(isAfterPageMarker(["blob3", ""], marker), true);
  });

  it("orders items against a composite token by name then secondary key", () => {
    const marker = decodePageMarker(encodePageMarker(["blob2", "v2"]));
    assert.strictEqual(isAfterPageMarker(["blob1", "v9"], marker), false);
    assert.strictEqual(isAfterPageMarker(["blob2", "v1"], marker), false);
    assert.strictEqual(isAfterPageMarker(["blob2", "v2"], marker), false);
    assert.strictEqual(isAfterPageMarker(["blob2", "v3"], marker), true);
    assert.strictEqual(isAfterPageMarker(["blob3", ""], marker), true);
  });

  it("emits a composite token when a page stops part way through one name", () => {
    // Three versions of one blob, page size 2
    const versions: [string, string][] = [
      ["blob1", "v1"],
      ["blob1", "v2"],
      ["blob1", "v3"]
    ];
    const page = new PageWithDelimiter<[string, string]>(2);
    const reader = (o: number) => Promise.resolve(versions.slice(o, o + 2));

    return page.fill(reader, (item) => item).then(([items, , marker]) => {
      assert.strictEqual(items.length, 2);
      const decoded = decodePageMarker(marker);
      assert.strictEqual(decoded.isComposite, true);
      assert.strictEqual(decoded.name, "blob1");
      assert.strictEqual(decoded.secondaryKey, "v2");
    });
  });

  it("tolerates repeated keys without advancing the marker", () => {
    // Snapshots share a blob name and carry no secondary key
    const docs: [string, string][] = [
      ["blob1", ""],
      ["blob1", ""],
      ["blob2", ""]
    ];
    const page = new PageWithDelimiter<[string, string]>(2);
    const reader = (o: number) => Promise.resolve(docs.slice(o, o + 2));

    return page.fill(reader, (item) => item).then(([items, , marker]) => {
      assert.strictEqual(items.length, 2);
      assert.strictEqual(marker, "blob1");
    });
  });
});
