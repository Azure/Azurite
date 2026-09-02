const fs = require("fs");
const path = require("path");
const Mocha = require("mocha");

/**
 * Shared Mocha bootstrap for every VSIX suite's extensionTestsPath entry
 * point. Pass explicit `files` (absolute paths) to run a fixed subset, or
 * omit it to auto-discover every *.test.js under `dir`.
 */
function run(dir, files) {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 120000 });
  const testFiles =
    files ??
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".test.js"))
      .map((f) => path.resolve(dir, f));
  testFiles.forEach((f) => mocha.addFile(f));

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} test(s) failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { run };
