const rcedit = require('rcedit');
const glob = require('glob');
const path = require('path');
const pjson = require('../package.json');
const fs = require('fs');
// the process.env definition is placed here because the code breaks when it is 
// placed after requiring pkg and pkg-fetch
process.env.PKG_CACHE_PATH = path.resolve('.\\.pkg-cache');
const pkg = require('pkg');
const pkgFetch = require('pkg-fetch');

build();

async function build() {
  const pkgTarget = 'node18-win-x64';
  const cacheExe = await downloadCache(pkgTarget);
  await rcedit(cacheExe, {
    "version-string": {
      "CompanyName": "Microsoft",
      "ProductName": "Azurite",
      "FileDescription": "Azurite",
      "ProductVersion": pjson.version,
      "OriginalFilename": "",
      "InternalName": "node",
      "LegalCopyright": "© 2021 Microsoft. All rights reserved."
    },
    // file-version is kept as the node version used by the .exe for debugging purposes
    "icon": path.resolve('.\\icon.ico')
  });

  // rename the cache file to skip hash check by pkg-fetch since hash check reverts our change of properties
  const newName = cacheExe.replace("fetched", "built");

  function asyncRename(oldName, changedName) {
    return new Promise(resolve => {
      fs.rename(oldName, changedName, response => resolve(response));
    });
  }

  await asyncRename(cacheExe, newName);

  const outputExe = path.resolve('.\\release\\azurite.exe');
  await pkg.exec([path.resolve('.'), ...['--target', pkgTarget], ...['--output', outputExe], ...['-C', 'Brotli']]);
}

async function downloadCache(pkgTarget) {
  const [nodeRange, platform, arch] = pkgTarget.split('-');

  await pkgFetch.need({ nodeRange, platform, arch });
  const cacheExe = glob.sync(process.env.PKG_CACHE_PATH + "\\**\\fetched*");
  if (cacheExe.length < 1) {
    console.log('Error downloading PKG cache');
    process.exit(1);
  }
  return cacheExe[0];
}