const chai = require('chai'),
    chaiHttp = require('chai-http'),
    should = chai.should(),
    expect = chai.expect,
    BbPromise = require('bluebird'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    Azurite = require('./../lib/Azurite'),
    rp = require('request-promise'),
    path = require('path');

chai.use(chaiHttp);

const containerName = 'testcontainer';
const blobName = 'testblob';
const url = `http://localhost:10000`;
const urlPath = `/devstoreaccount1`;

describe('Blob HTTP API', () => {
    const azurite = new Azurite();

    before(() => {
        const location = path.join(process.env.AZURITE_LOCATION, 'BLOB');
        return azurite.init({ l: location, silent: 'true', overwrite: 'true' })
            .then(() => {
                // Make sure there is an existing container 'testcontainer'
                const optionsContainer = {
                    method: 'PUT',
                    uri: `http://localhost:10000/devstoreaccount1/${containerName}?restype=container`,
                    body: ''
                };
                const optionsBlob = {
                    method: 'PUT',
                    headers: {
                        'x-ms-blob-type': 'BlockBlob',
                        'Content-Type': 'application/octet-stream'
                    },
                    uri: `http://localhost:10000/devstoreaccount1/${containerName}/${blobName}`,
                    body: 'abc123'
                }
                return rp(optionsContainer)
                    .then(() => {
                        return rp(optionsBlob);
                    });
            });
    });

    after(() => {
        return azurite.close();
    });

    describe('PUT Blob', () => {
        it('should fail to create a block due to missing container', () => {
            return chai.request(url)
                .put(`${urlPath}/DOESNOTEXISTS/blob`)
                .set('x-ms-blob-type', 'BlockBlob')
                .set('Content-Type', 'application/octet-stream')
                .send('THIS IS CONTENT')
                .catch((e) => {
                    e.should.have.status(404);
                })
        });
        it('should fail to create a block due to wrong or unsupported blob type', () => {
            return chai.request(url)
                .put(`${urlPath}/DOESNOTEXISTS/blob`)
                .set('x-ms-blob-type', 'NOTSUPPORTED')
                .set('Content-Type', 'application/octet-stream')
                .send('THIS IS CONTENT')
                .catch((e) => {
                    e.should.have.status(500);
                });
        });
        it('should create a simple blob without meta headers', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}/blob`)
                .set('x-ms-blob-type', 'BlockBlob')
                .set('Content-Type', 'application/octet-stream')
                .send('THIS IS CONTENT.')
                .then((res) => {
                    res.should.have.status(201);
                });
        });
    });

    describe('Blob Metadata', () => {
        it('should update an existing blob with metadata.', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}/${blobName}`)
                .query({ comp: 'metadata' })
                .set('x-ms-meta-test1', 'value1')
                .set('x-ms-meta-test2', 'value2')
                .set('x-ms-meta-meta1', 'meta1Value')
                .then((res) => {
                    res.should.have.status(200);
                });
        });
    });
});