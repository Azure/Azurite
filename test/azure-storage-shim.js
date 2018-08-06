const chai = require('chai'),
    fs = require('fs'),
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
        process.env.NOCK_OFF = "true"
        process.env.AZURE_STORAGE_CONNECTION_STRING = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
        const location = path.join(process.env.AZURITE_LOCATION, 'BLOB');
        return azurite.init({ l: location, silent: 'true', overwrite: 'true' }).then(() => {});
    });

    requireTestDir('');
    requireTestDir('/services/blob');
    requireTestDir('/services/queue');

    after(() => {
        return azurite.close();
    });
});
