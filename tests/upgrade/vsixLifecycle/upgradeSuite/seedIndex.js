const path = require("path");
const { run: runMocha } = require("../runMochaSuite");

/** extensionTestsPath for the "seed with published Marketplace vsix" phase - loads only seed.test.js. */
function run() {
  return runMocha(__dirname, [path.resolve(__dirname, "seed.test.js")]);
}

module.exports = { run };
