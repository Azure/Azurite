
const chai = require('chai'),
    chaiHttp = require('chai-http'),
    should = chai.should();

chai.use(chaiHttp);

describe('Container', () => {
    const url = 'http://localhost:10000';
    const path = '/devstoreaccount1';
    const simpleContainerName = 'simpleContainer'

    describe('PUT Simple Container', () => {
        it('should create a container', (done) => {
            chai.request(url)
                .put(`${path}/${simpleContainerName}`)
                .query({ restype: 'container' })
                .end((err, res) => {
                    should.not.exist(err);
                    res.should.have.status(200);
                    done();
                });
        });
        it('and a second with the same name that fails', (done) => {
            chai.request(url)
                .put(`${path}/${simpleContainerName}`)
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
                .delete(`${path}/${simpleContainerName}`)
                .query({restype: 'container'})
                .end((err, res) => {
                    res.should.have.status(200);
                    done();
                });
        });
        it('deleting a non-existant container fails', (done) => {
            chai.request(url)
                .delete(`${path}/DOESNOTEXIST`)
                .query({restype: 'container'})
                .end((err, res) => {
                    res.should.have.status(404);
                    done();
                });
        });
    });
});