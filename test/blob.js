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
        it('should get the correct metadata.', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/${blobName}`)
                .query({ comp: 'metadata' })
                .then((res) => {
                    res.should.have.status(200);
                    res.should.have.header('x-ms-meta-test1', 'value1');
                    res.should.have.header('x-ms-meta-test2', 'value2');
                    res.should.have.header('x-ms-meta-meta1', 'meta1Value');
                    res.should.have.header('Last-Modified');
                    res.should.have.header('ETag');
                });
        });
        it('should fail to get metadata of a non-existant blob', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/BLOB_DOESNOTEXISTS`)
                .query({ comp: 'metadata' })
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
        it('should fail to get metadata of a blob in a non-existant container', () => {
            return chai.request(url)
                .get(`${urlPath}/CONTAINER_DOESNOTEXIST/BLOB_DOESNOTEXISTS`)
                .query({ comp: 'metadata' })
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
    });

    describe('Blob Properties', () => {
        it('should successfully set all system properties', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}/${blobName}`)
                .set('x-ms-blob-cache-control', 'true')
                .set('x-ms-blob-content-type', 'ContentType')
                .set('x-ms-blob-content-md5', 'ContentMD5')
                .set('x-ms-blob-content-encoding', 'ContentEncoding')
                .set('x-ms-blob-content-language', 'ContentLanguage')
                .query({ comp: 'properties' })
                .then((res) => {
                    res.should.have.status(200);
                });
        });
        it('should get all previously set system properties', () => {
            return chai.request(url)
                .head(`${urlPath}/${containerName}/${blobName}`)
                .then((res) => {
                    res.should.have.status(200);
                    res.should.have.header('ETag');
                    res.should.have.header('Last-Modified');
                    res.should.have.header('Content-Type', 'ContentType');
                    res.should.have.header('Content-Encoding', 'ContentEncoding');
                    res.should.have.header('Content-MD5', 'ContentMD5');
                    res.should.have.header('Content-Language', 'ContentLanguage');
                    res.should.have.header('Cache-Control', 'true');
                    res.should.have.header('x-ms-blob-type', 'BlockBlob');
                });
        });
    });
});