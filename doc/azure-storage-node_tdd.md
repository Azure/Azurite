# Testing with Azure Storage Node

We have added the Azure Storage Node package as a submodule under ./externaltests

To run these tests, you need to open your git console and run the following command in your Azurite repo:

```shell
git submodule update
```

Once the submodule has been cloned, you need to change to the **./externaltests/azure-storage-node** folder and run 

```shell
npm install
```

This will install the dependencies, and allow you to run the tests.

To debug test cases, you can use the following addition to your VS Code launch.json:

```json
        {
            "type": "node",
            "request": "launch",
            "env": {
                "AZURITE_LOCATION" :"azurite-storage-testdrive",
                "NOCK_OFF": "true",
                "AZURE_STORAGE_CONNECTION_STRING": "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;",
                "AZURE_STORAGE_CONNECTION_STRING_BLOB_ACCOUNT" : "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
            },
            "name": "Azure Storage Tests",
            "program": "${workspaceRoot}/node_modules/mocha/bin/_mocha",
            "args": [
                "-u",
                "tdd",
                "--timeout",
                "999999",
                "--colors",
                "${workspaceRoot}/externaltests"
            ],
            "internalConsoleOptions": "openOnSessionStart",
            "protocol": "inspector"
        },
```

The tests are currently run by ./externaltests/azure-storage-shim.js , and we are looking at making this more comfortable for developers at the early stages of feature implementation.  
Currently, we are just commenting out those test scripts which we do not want to run.
i.e:

```javascript
describe('azure-storage-node tests', () => {
    const azurite = new Azurite();
    before(() => {
        const location = path.join(process.env.AZURITE_LOCATION, 'AZURE-STORAGE');
        return azurite.init({ l: location, silent: 'true', overwrite: 'true' });
    });

    //requireTestDir('');
    // Currently runs azure-storage tests individually, until we implement a playlist definition
    // require('./azure-storage-node/test/services/blob/blobservice-archive-tests');
    require('./azure-storage-node/test/services/blob/blobservice-container-tests');
    // require('./azure-storage-node/test/services/blob/blobservice-lease-tests');
    // require('./azure-storage-node/test/services/blob/blobservice-sse-tests'); 
    // require('./azure-storage-node/test/services/blob/blobservice-tests');
    // require('./azure-storage-node/test/services/blob/blobservice-uploaddownload-tests');
    // require('./azure-storage-node/test/services/blob/blobservice-uploaddownload-scale-tests');
```
