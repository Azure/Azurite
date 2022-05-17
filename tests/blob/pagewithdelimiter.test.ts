import assert = require("assert");
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
  const namer = (i: string) => { return i; };
  // return a reader for a list
  const createReader = (items: string[], maxResults: number):
    (o: number) => Promise<string[]> => {
    return (o: number) => { return Promise.resolve(items.slice(o, o+maxResults)); }
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
      const page = new PageWithDelimiter<string>(blobs.length+1);
      const [items, prefixes, marker] = await page.fill(createReader(blobs, blobs.length+1), namer);
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
