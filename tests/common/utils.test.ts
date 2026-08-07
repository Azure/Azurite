import { strict as assert } from "assert";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { rimrafAsync } from "../../src/common/utils/utils";

describe("rimrafAsync", () => {
  it("removes a directory and its contents", async () => {
    const dir = mkdtempSync(join(tmpdir(), "azurite-rimraf-test-"));
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "file.txt"), "content");
    writeFileSync(join(dir, "nested", "nested-file.txt"), "content");

    assert.equal(existsSync(dir), true);

    await rimrafAsync(dir);

    assert.equal(existsSync(dir), false);
  });

  it("resolves without error when the path does not exist", async () => {
    const dir = join(tmpdir(), "azurite-rimraf-test-does-not-exist");
    assert.equal(existsSync(dir), false);

    await rimrafAsync(dir);

    assert.equal(existsSync(dir), false);
  });
});
