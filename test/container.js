const chai = require('chai'),
    chaiHttp = require('chai-http'),
    should = chai.should(),
    BbPromise = require('bluebird'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    Azurite = require('./../lib/Azurite'),
    path = require('path');

chai.use(chaiHttp);

describe('Container HTTP API', () => {
    const azurite = new Azurite();

    before(() => {
        const location = path.join('.', process.env.AZURITE_LOCATION, 'CONTAINER');
        return azurite.init({ l: location, silent: 'true', overwrite: 'true' });
    });

    after(() => {
        return azurite.close();
    });

    const url = 'http://localhost:10000';
    const urlPath = '/devstoreaccount1';
    const simpleContainerName = 'simpleContainer'

    describe('PUT Simple Container', () => {
        it('should create a container', () => {
            return chai.request(url)
                .put(`${urlPath}/${simpleContainerName}`)
                .query({ restype: 'container' })
                .then((res) => {
                    res.should.have.status(200);
                });
        });
        it('and a second with the same name that fails', () => {
            return chai.request(url)
                .put(`${urlPath}/${simpleContainerName}`)
                .query({ restype: 'container' })
                .catch((e) => {
                    e.should.have.status(409);
                })
        });
    });
    describe('DELETE Simple Container', () => {
        it('successfully deletes the container', () => {
            return chai.request(url)
                .delete(`${urlPath}/${simpleContainerName}`)
                .query({ restype: 'container' })
                .then((res) => {
                    res.should.have.status(200);
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
});