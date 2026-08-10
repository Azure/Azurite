const path = require("path");
const Mocha = require("mocha");

/** Loads only seed.test.js - this is the extensionTestsPath for the "seed with published Marketplace vsix" phase. */
function run() {
  const mocha = new Mocha({ ui: "bdd", color: true, timeout: 120000 });
  mocha.addFile(path.resolve(__dirname, "seed.test.js"));

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
