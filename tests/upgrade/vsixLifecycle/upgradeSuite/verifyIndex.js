const path = require("path");
const { run: runMocha } = require("../runMochaSuite");

/** extensionTestsPath for the "verify with local build" phase - loads only verify.test.js. */
function run() {
  return runMocha(__dirname, [path.resolve(__dirname, "verify.test.js")]);
}

module.exports = { run };
