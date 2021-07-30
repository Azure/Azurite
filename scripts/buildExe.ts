var rcedit = require('rcedit');
var glob = require('glob');
var path = require('path');
var pjson = require('..\\package.json');
var fs = require('fs');


process.env.PKG_CACHE_PATH = path.resolve('.\\.pkg-cache');

build();

async function build() {
  const pkgTarget = 'node14-win-x64';
  const cacheExe = await downloadCache(pkgTarget);
  await rcedit(cacheExe, {
    "version-string": {
      "CompanyName": "Microsoft", 
      "ProductName": "Azurite", 
      "FileDescription": "A lightweight server clone of Azure Storage that simulates most of the commands supported by it with minimal dependencies", 
      "ProductVersion": pjson.version,
      "OriginalFilename": "",
      "InternalName": "node",
      "LegalCopyright": "© 2021 Microsoft. All rights reserved."
    },
    // file-version is kept as the node version used by the .exe for debugging purposes
    "icon": path.resolve('.\\icon.ico')
  });
  
  // rename the cache file to skip hash check by pkg-fetch since hash check reverts our change of properties
  let newName = cacheExe.replace("fetched", "built");

  function asyncRename(oldName, changedName) {
    return new Promise(resolve => {
      fs.rename(oldName, changedName, response => resolve(response));
    });
  }

  await asyncRename(cacheExe, newName);

  const pkg = await import('pkg');
  const outputExe = path.resolve('.\\release\\azurite.exe');
  await pkg.exec([path.resolve('.'), ...['--target', pkgTarget], ...['--output', outputExe], ...['-C', 'Brotli']]);
}

async function downloadCache(pkgTarget) {
  const [nodeRange, platform, arch] = pkgTarget.split('-');
  const pkgFetch = await import('pkg-fetch');
  await pkgFetch.need({ nodeRange, platform, arch });
  const cacheExe = glob.sync(process.env.PKG_CACHE_PATH + "\\**\\fetched*");
  if (cacheExe.length < 1) {
    console.log('Error downloading PKG cache');
    process.exit(1);
  }
  return cacheExe[0];
}