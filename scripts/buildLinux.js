const glob = require('glob');
const path = require('path');
const fs = require('fs');
process.env.PKG_CACHE_PATH = path.resolve('./.pkg-cache');
const pkg = require('pkg');
const pkgFetch = require('pkg-fetch');

// Build only if the platform is linux
if (process.platform === "linux") {
  build();
}
else {
  throw new Error("Cannot build linux binaries on windows. Please try running buildExe.js");
}

async function build() {
  const pkgTarget = 'node14-linux-x64';
  const cacheLinux = await downloadCache(pkgTarget);
  const newName = cacheLinux.replace("fetched", "built");

  function asyncRename(oldName, changedName) {
    return new Promise(resolve => {
      fs.rename(oldName, changedName, response => resolve(response));
    });
  }

  await asyncRename(cacheLinux, newName);

  const outputExe = path.resolve('./release/azuritelinux');
  await pkg.exec([path.resolve('.'), ...['--target', pkgTarget], ...['--output', outputExe], ...['-C', 'Brotli']]);
}

async function downloadCache(pkgTarget) {
  const [nodeRange, platform, arch] = pkgTarget.split('-');

  await pkgFetch.need({ nodeRange, platform, arch });
  const cacheLinux = glob.sync(process.env.PKG_CACHE_PATH + "/**/fetched*");
  if (cacheLinux.length < 1) {
    console.log('Error downloading PKG cache');
    process.exit(1);
  }
  return cacheLinux[0];
}