/**
 * NOTE: the shim requires the following environment variables to be set to work:
 * KNOCK_OFF=true
 * AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;
 * this is automatically handled via env-cmd in the package.json for npm run test
 */

const fs = require('fs'),
    path = require('path'),
    Azurite = require('./../lib/AzuriteBlob');

function requireTestDir(dir) {
    fs.readdirSync('./test/azure-storage-node/test' + dir).map((file) => {
        if(file.endsWith('.js')) require('./azure-storage-node/test' + dir + path.sep + file.slice(0,-3));
    })
}

describe('azure-storage-node tests', () => {
    const azurite = new Azurite();
    before(() => {
        const location = path.join(process.env.AZURITE_LOCATION, 'AZURE-STORAGE');
        return azurite.init({ l: location, silent: 'true', overwrite: 'true' });
    });

    //requireTestDir('');
    //requireTestDir('/services/blob');
    require('./azure-storage-node/test/services/blob/blobservice-tests');

    after(() => {
        return azurite.close();
    });
});
