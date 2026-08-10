const path = require("path");
const Mocha = require("mocha");

/** Loads only verify.test.js - this is the extensionTestsPath for the "verify with local build" phase. */
function run() {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 120000 });
  mocha.addFile(path.resolve(__dirname, "verify.test.js"));

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
