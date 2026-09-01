import { strict as assert } from "assert";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const lintStagedBin = path.resolve(
  repoRoot,
  "node_modules/lint-staged/bin/lint-staged.js"
);

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.strictEqual(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${result.stderr}`
  );
}

describe("lint-staged configuration @loki", () => {
  const config = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, ".lintstagedrc"), "utf8")
  ) as Record<string, string>;

  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "azurite-lint-staged-"));
    git(workspace, "init", "--quiet", "--initial-branch", "main", ".");
    git(workspace, "config", "user.email", "azurite@example.com");
    git(workspace, "config", "user.name", "Azurite Test");
    fs.copyFileSync(
      path.resolve(repoRoot, ".lintstagedrc"),
      path.join(workspace, ".lintstagedrc")
    );
    fs.writeFileSync(path.join(workspace, "seed.txt"), "seed\n");
    git(workspace, "add", ".");
    git(workspace, "commit", "--quiet", "-m", "initial");
  });

  afterEach(() => {
    fs.rmSync(workspace, { force: true, recursive: true });
  });

  it("uses the flat glob-to-command format", () => {
    assert.ok(
      !("linters" in config) && !("ignore" in config),
      "The deprecated linters/ignore format was removed in lint-staged v10+"
    );
    for (const [glob, command] of Object.entries(config)) {
      assert.ok(glob.length > 0);
      assert.strictEqual(typeof command, "string");
    }
  });

  it("formats staged files matching the configured globs", () => {
    fs.writeFileSync(path.join(workspace, "sample.ts"), "const   a =   1\n");
    fs.writeFileSync(path.join(workspace, "notes.txt"), "const   b =   2\n");
    git(workspace, "add", "sample.ts", "notes.txt");

    const result = spawnSync(process.execPath, [lintStagedBin], {
      cwd: workspace,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${path.resolve(repoRoot, "node_modules/.bin")}${path.delimiter}${
          process.env.PATH
        }`
      }
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(
      fs.readFileSync(path.join(workspace, "sample.ts"), "utf8"),
      "const a = 1;\n"
    );
    assert.strictEqual(
      fs.readFileSync(path.join(workspace, "notes.txt"), "utf8"),
      "const   b =   2\n",
      "Extensions outside the configured globs must not be formatted"
    );

    const staged = spawnSync("git", ["show", ":sample.ts"], {
      cwd: workspace,
      encoding: "utf8"
    });
    assert.strictEqual(staged.status, 0, staged.stderr);
    assert.strictEqual(
      staged.stdout,
      "const a = 1;\n",
      "Task output must be staged back into the git index"
    );
  });

  it("fails when a staged file cannot be processed by the configured task", () => {
    fs.writeFileSync(path.join(workspace, "broken.json"), "{ invalid json\n");
    git(workspace, "add", "broken.json");

    const result = spawnSync(process.execPath, [lintStagedBin], {
      cwd: workspace,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${path.resolve(repoRoot, "node_modules/.bin")}${path.delimiter}${
          process.env.PATH
        }`
      }
    });

    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(
      fs.readFileSync(path.join(workspace, "broken.json"), "utf8"),
      "{ invalid json\n",
      "lint-staged must restore the original staged content on failure"
    );
  });
});
