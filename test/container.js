const chai = require('chai'),
    chaiHttp = require('chai-http'),
    should = chai.should(),
    BbPromise = require('bluebird'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    Azurite = require('./../lib/AzuriteBlob'),
    rp = require('request-promise'),
    path = require('path');

chai.use(chaiHttp);

const containerName = 'containertestcontainer';
const propContainer = 'propTestcontainer';
const url = 'http://localhost:10000';
const urlPath = '/devstoreaccount1';

describe('Container HTTP API', () => {
    const azurite = new Azurite();

    before(() => {
        const location = path.join('.', process.env.AZURITE_LOCATION, 'CONTAINER');
        return azurite.init({ l: location, silent: 'true', overwrite: 'true' })
            .then(() => {
                // Make sure there is an existing container 'metadatatestcontainer'
                const optionsContainer = {
                    method: 'PUT',
                    uri: `http://localhost:10000/devstoreaccount1/${propContainer}?restype=container`,
                    body: ''
                };
                return rp(optionsContainer);
            });
    });

    after(() => {
        return azurite.close();
    });



    describe('PUT Simple Container', () => {
        it('should create a container', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}`)
                .query({ restype: 'container' })
                .then((res) => {
                    res.should.have.status(201);
                });
        });
        it('and a second with the same name that fails', () => {
            return chai.request(url)
                .put(`${urlPath}/${containerName}`)
                .query({ restype: 'container' })
                .catch((e) => {
                    e.should.have.status(409);
                })
        });
    });
    describe('DELETE Simple Container', () => {
        it('successfully deletes the container', () => {
            return chai.request(url)
                .delete(`${urlPath}/${containerName}`)
                .query({ restype: 'container' })
                .then((res) => {
                    res.should.have.status(202);
                });
        });
        it('deleting a non-existant container fails', () => {
            return chai.request(url)
                .delete(`${urlPath}/DOESNOTEXIST`)
                .query({ restype: 'container' })
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
    });
    describe('Container Metadata', () => {
        it('should update an existing container with metadata.', () => {
            return chai.request(url)
                .put(`${urlPath}/${propContainer}`)
                .query({ restype: 'container', comp: 'metadata' })
                .set('x-ms-meta-test1', 'value1')
                .set('x-ms-meta-test2', 'value2')
                .set('x-ms-meta-meta1', 'meta1Value')
                .then((res) => {
                    res.should.have.status(200);
                });
        });
        it('should get the correct metadata. (GET)', () => {
            return chai.request(url)
                .get(`${urlPath}/${propContainer}`)
                .query({ restype: 'container', comp: 'metadata' })
                .then((res) => {
                    res.should.have.status(200);
                    res.should.have.header('x-ms-meta-test1', 'value1');
                    res.should.have.header('x-ms-meta-test2', 'value2');
                    res.should.have.header('x-ms-meta-meta1', 'meta1Value');
                    res.should.have.header('Last-Modified');
                    res.should.have.header('ETag');
                });
        });
        it('should get the correct metadata. (HEAD)', () => {
            return chai.request(url)
                .head(`${urlPath}/${propContainer}`)
                .query({ restype: 'container', comp: 'metadata' })
                .then((res) => {
                    res.should.have.status(200);
                    res.should.have.header('x-ms-meta-test1', 'value1');
                    res.should.have.header('x-ms-meta-test2', 'value2');
                    res.should.have.header('x-ms-meta-meta1', 'meta1Value');
                    res.should.have.header('Last-Modified');
                    res.should.have.header('ETag');
                });
        });
        it('should fail to get metadata of a non-existant container (GET)', () => {
            return chai.request(url)
                .get(`${urlPath}/CONTAINER_DOESNOTEXIST`)
                .query({ restype: 'container', comp: 'metadata' })
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
        it('should fail to get metadata of a non-existant container (HEAD)', () => {
            return chai.request(url)
                .head(`${urlPath}/CONTAINER_DOESNOTEXIST`)
                .query({ restype: 'container', comp: 'metadata' })
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
    });
    describe('Container System Properties', () => {
        it('should update an existing container with metadata.', () => {
            return chai.request(url)
                .put(`${urlPath}/${propContainer}`)
                .query({ restype: 'container', comp: 'metadata' })
                .set('x-ms-meta-test1', 'value1')
                .set('x-ms-meta-test2', 'value2')
                .set('x-ms-meta-meta1', 'meta1Value')
                .then((res) => {
                    res.should.have.status(200);
                });
        });
        it('should get the correct metadata. (GET)', () => {
            return chai.request(url)
                .get(`${urlPath}/${propContainer}`)
                .query({ restype: 'container' })
                .then((res) => {
                    res.should.have.status(200);
                    res.should.have.header('x-ms-meta-test1', 'value1');
                    res.should.have.header('x-ms-meta-test2', 'value2');
                    res.should.have.header('x-ms-meta-meta1', 'meta1Value');
                    res.should.have.header('Last-Modified');
                    res.should.have.header('ETag');
                });
        });
        it('should get the correct metadata. (HEAD)', () => {
            return chai.request(url)
                .head(`${urlPath}/${propContainer}`)
                .query({ restype: 'container' })
                .then((res) => {
                    res.should.have.status(200);
                    res.should.have.header('x-ms-meta-test1', 'value1');
                    res.should.have.header('x-ms-meta-test2', 'value2');
                    res.should.have.header('x-ms-meta-meta1', 'meta1Value');
                    res.should.have.header('Last-Modified');
                    res.should.have.header('ETag');
                });
        });
        it('should fail to get metadata of a non-existant container (GET)', () => {
            return chai.request(url)
                .get(`${urlPath}/CONTAINER_DOESNOTEXIST`)
                .query({ restype: 'container' })
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
        it('should fail to get metadata of a non-existant container (HEAD)', () => {
            return chai.request(url)
                .head(`${urlPath}/CONTAINER_DOESNOTEXIST`)
                .query({ restype: 'container' })
                .catch((e) => {
                    e.should.have.status(404);
                });
        });
    });
});