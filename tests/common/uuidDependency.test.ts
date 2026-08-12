import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";

// Regression coverage for GHSA-w5hq-g745-h8pq / CVE-2026-41907, where uuid
// v3()/v5()/v6() silently performed partial writes into caller supplied
// buffers instead of validating the requested byte range.
describe("uuid dependency @loki", () => {
  const uuidPackageJson = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../node_modules/uuid/package.json"),
      "utf8"
    )
  ) as { version: string };

  const parseVersion = (version: string): number[] =>
    version.split("-")[0].split(".").map(part => parseInt(part, 10));

  it("resolves to a version with the v3/v5/v6 buffer bounds fix", () => {
    const [major, minor, patch] = parseVersion(uuidPackageJson.version);
    const isPatched =
      major > 11 ||
      (major === 11 && (minor > 1 || (minor === 1 && patch >= 1)));

    assert.ok(
      isPatched,
      `uuid ${uuidPackageJson.version} is vulnerable to GHSA-w5hq-g745-h8pq, expected >= 11.1.1`
    );
  });

  it("throws RangeError when v3/v5/v6 write out of buffer bounds", () => {
    const { v3, v4, v5, v6 } = require("uuid");
    const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

    assert.throws(() => v4({}, new Uint8Array(8), 4), RangeError);
    assert.throws(() => v3("azurite", namespace, new Uint8Array(8), 4), RangeError);
    assert.throws(() => v5("azurite", namespace, new Uint8Array(8), 4), RangeError);
    assert.throws(() => v6({}, new Uint8Array(8), 4), RangeError);
  });

  it("still writes a full uuid into a buffer with enough room", () => {
    const { v5 } = require("uuid");
    const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const buffer = new Uint8Array(20).fill(0xaa);

    v5("azurite", namespace, buffer, 4);

    assert.deepEqual(Array.from(buffer.subarray(0, 4)), [
      0xaa,
      0xaa,
      0xaa,
      0xaa
    ]);
    assert.ok(buffer.subarray(4, 20).some(byte => byte !== 0xaa));
  });
});
