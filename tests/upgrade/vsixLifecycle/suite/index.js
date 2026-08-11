const path = require("path");
const { run: runMocha } = require("../runMochaSuite");

function run() {
  return runMocha(path.resolve(__dirname));
}

module.exports = { run };
