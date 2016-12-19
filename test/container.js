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
        it('should create a container', (done) => {
            chai.request(url)
                .put(`${urlPath}/${simpleContainerName}`)
                .query({ restype: 'container' })
                .end((err, res) => {
                    should.not.exist(err);
                    res.should.have.status(200);
                    done();
                });
        });
        it('and a second with the same name that fails', (done) => {
            chai.request(url)
                .put(`${urlPath}/${simpleContainerName}`)
                .query({ restype: 'container' })
                .end((err, res) => {
                    res.should.have.status(409);
                    done();
                });
        });
    });
    describe('DELETE Simple Container', () => {
        it('successfully deletes the container', (done) => {
            chai.request(url)
                .delete(`${urlPath}/${simpleContainerName}`)
                .query({ restype: 'container' })
                .end((err, res) => {
                    res.should.have.status(200);
                    done();
                });
        });
        it('deleting a non-existant container fails', (done) => {
            chai.request(url)
                .delete(`${urlPath}/DOESNOTEXIST`)
                .query({ restype: 'container' })
                .end((err, res) => {
                    res.should.have.status(404);
                    done();
                });
        });
    });
});