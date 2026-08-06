import * as assert from "assert";
import * as fs from "fs-extra";
import { join } from "path";

import { BlobEventType, IBlobEvent } from "../../src/blob/events/IBlobEvent";
import FileBlobEventSink from "../../src/blob/events/FileBlobEventSink";
import ILogger from "../../src/common/ILogger";

const noopLogger: ILogger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  verbose: () => undefined,
  debug: () => undefined
};

function sampleEvent(id: string): IBlobEvent {
  return {
    topic: "/subscriptions/x/storageAccounts/devstoreaccount1",
    subject: "/blobServices/default/containers/c1/blobs/b",
    eventType: BlobEventType.BlobCreated,
    id,
    eventTime: "2026-08-06T12:34:56.789Z",
    dataVersion: "",
    metadataVersion: "1",
    data: {
      api: "PutBlob",
      requestId: "req-1",
      url: "http://127.0.0.1:10000/devstoreaccount1/c1/b",
      sequencer: "0".repeat(63) + "1",
      storageDiagnostics: { batchId: "req-1" }
    }
  };
}

describe("FileBlobEventSink @loki @sql", () => {
  const folder = "__test_blob_events__";

  afterEach(() => {
    if (fs.existsSync(folder)) {
      fs.removeSync(folder);
    }
  });

  it("writes one JSON file per event after init", async () => {
    const sink = new FileBlobEventSink(folder, noopLogger);
    await sink.init();
    sink.emit(sampleEvent("id-aaa"));
    sink.emit(sampleEvent("id-bbb"));
    await sink.close();

    const files = fs.readdirSync(folder).filter((f) => f.endsWith(".json"));
    assert.strictEqual(files.length, 2);

    const parsed = JSON.parse(
      fs.readFileSync(join(folder, files[0]), "utf8").toString()
    );
    assert.strictEqual(parsed.eventType, "Microsoft.Storage.BlobCreated");
    assert.strictEqual(parsed.data.api, "PutBlob");
  });

  it("uses a Windows-safe, id-bearing filename", async () => {
    const sink = new FileBlobEventSink(folder, noopLogger);
    await sink.init();
    sink.emit(sampleEvent("id-ccc"));
    await sink.close();

    const files = fs.readdirSync(folder);
    assert.strictEqual(files.length, 1);
    assert.ok(files[0].includes("id-ccc"));
    assert.ok(!files[0].includes(":"));
    assert.ok(files[0].endsWith(".json"));
    // The "." between seconds and milliseconds in eventTime must be replaced;
    // the only dot allowed is the .json extension.
    assert.ok(
      !files[0].slice(0, -".json".length).includes("."),
      "eventTime dots must be replaced in the filename"
    );
  });

  it("neutralizes path separators in event fields to prevent traversal", async () => {
    const sink = new FileBlobEventSink(folder, noopLogger);
    await sink.init();
    // A crafted id containing traversal sequences must not escape the folder.
    sink.emit(sampleEvent("../../../../evil"));
    await sink.close();

    const files = fs.readdirSync(folder).filter((f) => f.endsWith(".json"));
    assert.strictEqual(files.length, 1, "event must be written inside the folder");
    assert.ok(
      !files[0].includes("/") && !files[0].includes("\\"),
      "filename must contain no path separators"
    );
    assert.ok(
      !fs.existsSync(join(folder, "..", "evil.json")),
      "nothing must be written outside the capture folder"
    );
  });

  it("self-disables and does not throw when the folder cannot be created", async () => {
    // Point at a path under an existing FILE so ensureDir fails.
    fs.ensureFileSync(join(folder, "afile"));
    const badPath = join(folder, "afile", "subdir");
    const sink = new FileBlobEventSink(badPath, noopLogger);
    await sink.init(); // must not throw
    sink.emit(sampleEvent("id-ddd")); // must not throw
    await sink.close();
    assert.ok(!fs.existsSync(badPath));
  });
});
