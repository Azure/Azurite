import * as assert from "assert";
import { isAbsolute, join } from "path";

import { resolveBlobEventCapturePath } from "../../src/blob/events/resolveBlobEventCapturePath";
import { DEFAULT_BLOB_EVENT_CAPTURE_PATH } from "../../src/blob/utils/constants";

describe("resolveBlobEventCapturePath @loki @sql", () => {
  const location = join("some", "workspace");

  it("returns empty string when capture is disabled", () => {
    assert.strictEqual(
      resolveBlobEventCapturePath(false, "anything", location),
      ""
    );
    assert.strictEqual(resolveBlobEventCapturePath(false, "", location), "");
    assert.strictEqual(
      resolveBlobEventCapturePath(false, undefined, location),
      ""
    );
  });

  it("falls back to the default folder under location when no path is configured", () => {
    const expected = join(location, DEFAULT_BLOB_EVENT_CAPTURE_PATH);
    assert.strictEqual(resolveBlobEventCapturePath(true, "", location), expected);
    assert.strictEqual(
      resolveBlobEventCapturePath(true, undefined, location),
      expected
    );
  });

  it("resolves a relative configured path against location", () => {
    assert.strictEqual(
      resolveBlobEventCapturePath(true, "events", location),
      join(location, "events")
    );
  });

  it("uses an absolute configured path verbatim", () => {
    const abs = join(process.cwd(), "abs-events");
    assert.ok(isAbsolute(abs), "test fixture must be an absolute path");
    assert.strictEqual(resolveBlobEventCapturePath(true, abs, location), abs);
  });
});
