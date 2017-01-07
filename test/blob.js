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
const blockBlobName = 'testblockblob';
const appendBlobName = 'testappendblob';
const url = `http://localhost:10000`;
const urlPath = `/devstoreaccount1`;


function createBlob(containerNamex, blobNamex, payload, blobType) {
    // Make sure there is an existing container 'testcontainer'
    const optionsContainer = {
        method: 'PUT',
        uri: `http://localhost:10000/devstoreaccount1/${containerNamex}?restype=container`,
        body: ''
    };
    const optionsBlob = {
        method: 'PUT',
        headers: {
            'x-ms-blob-type': blobType,
            'Content-Type': 'application/octet-stream'
        },
        uri: `http://localhost:10000/devstoreaccount1/${containerNamex}/${blobNamex}`,
        body: payload
    }

    return rp(optionsContainer)
        .then(() => {
            return rp(optionsBlob);
        });
}

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
                const optionsBlockBlob = {
                    method: 'PUT',
                    headers: {
                        'x-ms-blob-type': 'BlockBlob',
                        'Content-Type': 'application/octet-stream'
                    },
                    uri: `http://localhost:10000/devstoreaccount1/${containerName}/${blockBlobName}`,
                    body: 'abc123'
                }
                const optionsAppendBlob = {
                    method: 'PUT',
                    headers: {
                        'x-ms-blob-type': 'AppendBlob',
                        'Content-Type': 'application/octet-stream'
                    },
                    uri: `http://localhost:10000/devstoreaccount1/${containerName}/${appendBlobName}`,
                    body: ''
                }
                return rp(optionsContainer)
                    .then(() => {
                        return rp(optionsBlockBlob);
                    })
                    .then(() => {
                        return rp(optionsAppendBlob);
                    });
            });
    });

    after(() => {
        return azurite.close();
    });

    describe('PUT Block Blob', () => {
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
                .put(`${urlPath}/${containerName}/blob`)
                .set('x-ms-blob-type', 'NOTSUPPORTED')
                .set('Content-Type', 'application/octet-stream')
                .send('THIS IS CONTENT')
                .catch((e) => {
                    e.should.have.status(400);
                });
        });
        it('should create a simple block blob without meta headers', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}/blob`)
                .set('x-ms-blob-type', 'BlockBlob')
                .set('Content-Type', 'application/octet-stream')
                .send('abcdefghijklmn')
                .then((res) => {
                    res.should.have.status(201);
                });
        });
    });

    describe('Put BlockList', () => {
        const putBlockListBlobName = 'putBlockListBlobName';
        it('should create a block blob from a list of blocks', () => {
            const optionsBlockBlob = {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': 6
                },
                qs: {
                    'comp': 'block',
                    'blockid': 'AAAAAA=='
                },
                uri: `http://localhost:10000/devstoreaccount1/${containerName}/${putBlockListBlobName}`,
                body: 'AAAAAA'
            }

            return rp(optionsBlockBlob)
                .then(() => {
                    optionsBlockBlob.body = 'BBBBBB';
                    optionsBlockBlob.qs.blockid = 'BBBBBB=='
                    return rp(optionsBlockBlob);
                })
                .then(() => {
                    optionsBlockBlob.body = 'CCCCCC';
                    optionsBlockBlob.qs.blockid = 'CCCCCC=='
                    return rp(optionsBlockBlob);
                })
                .then(() => {
                    optionsBlockBlob.body = 'DDDDDD';
                    optionsBlockBlob.qs.blockid = 'DDDDDD=='
                    return rp(optionsBlockBlob);
                })
                .then(() => {
                    const xmlBody = 
                    `<!--?xml version="1.0" encoding="utf-8"?-->
                    <blocklist>
                        <latest>AAAAAA==</latest>
                        <latest>CCCCCC==</latest>
                        <latest>AAAAAA==</latest
                    ></blocklist>`
                    return chai.request(url)
                        .put(`${urlPath}/${containerName}/${putBlockListBlobName}`)
                        .query({ comp: 'blocklist' })
                        .send(xmlBody)
                        .then((res) => {
                            res.should.have.status(201);
                        });
                });
        });
    });

    describe('Delete Blob', () => {
        it('should delete an existing Block Blob', () => {
            return createBlob('deleteblobtest', 'blob', 'abc123', 'BlockBlob')
                .then(() => {
                    return chai.request(url)
                        .delete(`${urlPath}/deleteblobtest/blob`);
                })
                .then((res) => {
                    res.should.have.status(202);
                })
        });
        it('should fail when deleting a non-existant blob', () => {
            return chai.request(url)
                .delete(`${urlPath}/deleteblobtest/DOESNOTEXIST`)
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
        it('should fail when deleting from a non-existant container', () => {
            return chai.request(url)
                .delete(`${urlPath}/DOESNOTEXIST/DOESNOTEXIST`)
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
    });

    describe('Append Blobs', () => {
        it('should create an append blob', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}/appendBlob`)
                .set('x-ms-blob-type', 'AppendBlob')
                .set('Content-Type', 'application/octet-stream')
                .then((res) => {
                    res.should.have.status(201);
                });
        });
        it('should append data to the append blob', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}/appendBlob`)
                .query({ comp: 'appendblock' })
                .set('x-ms-blob-type', 'AppendBlob')
                .set('Content-Type', 'application/octet-stream')
                .send('abcdefghi')
                .then((res) => {
                    res.should.have.status(201);
                });
        });
        it('should fail to create an append blob with size > 0', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}/appendBlob`)
                .set('x-ms-blob-type', 'AppendBlob')
                .set('Content-Type', 'application/octet-stream')
                .send('abcdefg')
                .catch((e) => {
                    e.should.have.status(409);
                });
        });
    });

    describe('GET Blob', () => {
        it('should get the correct content of the Block Blob', () => {
            const optionsBlockBlobGet = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                uri: `http://localhost:10000/devstoreaccount1/${containerName}/${blockBlobName}`
            }
            return rp(optionsBlockBlobGet)
                .then((res) => {
                    expect(res).to.be.equal('abc123');
                });
        });
        it('should get the correct type of the append blob', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/${appendBlobName}`)
                .then((res) => {
                    res.should.have.status(200);
                    res.should.have.header('x-ms-blob-type', 'AppendBlob');
                });
        });
    });

    describe('Blob Metadata', () => {
        it('should update an existing blob with metadata.', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}/${blockBlobName}`)
                .query({ comp: 'metadata' })
                .set('x-ms-meta-test1', 'value1')
                .set('x-ms-meta-test2', 'value2')
                .set('x-ms-meta-meta1', 'meta1Value')
                .then((res) => {
                    res.should.have.status(200);
                });
        });
        it('should get the correct metadata', () => {
            return chai.request(url)
                .get(`${urlPath}/${containerName}/${blockBlobName}`)
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
                .put(`${urlPath}/${containerName}/${blockBlobName}`)
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
                .head(`${urlPath}/${containerName}/${blockBlobName}`)
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