const chai = require('chai'),
    chaiHttp = require('chai-http'),
    should = chai.should(),
    BbPromise = require('bluebird'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    Azurite = require('./../lib/Azurite'),
    path = require('path');

chai.use(chaiHttp);

describe('Blob HTTP API', () => {
    const azurite = new Azurite();

    before(() => {
        const location = path.join(process.env.AZURITE_LOCATION, 'BLOB');
        return azurite.init({ l: location, silent: 'true', overwrite: 'true' });
    });

    after(() => {
        return azurite.close();
    });

    const url = 'http://localhost:10000';
    const urlPath = '/devstoreaccount1';
    const simpleContainerName = 'simpleContainer'

    describe('PUT Blob', () => {
        it('should fail to create a block due to missing container', (done) => {
            chai.request(url)
                .put(`${urlPath}/DOESNOTEXISTS/blob`)
                .set('x-ms-blob-type', 'BlockBlob')
                .set('Content-Type', 'application/octet-stream')
                .send('THIS IS CONTENT')
                .end((err, res) => {
                    res.should.have.status(404);
                    done();
                });
        });
        it('should fail to create a block due wrong or unsupported blob type', (done) => {
            chai.request(url)
                .put(`${urlPath}/DOESNOTEXISTS/blob`)
                .set('x-ms-blob-type', 'NOTSUPPORTED')
                .set('Content-Type', 'application/octet-stream')
                .send('THIS IS CONTENT')
                .end((err, res) => {
                    res.should.have.status(500);
                    done();
                });
        });
    });
});