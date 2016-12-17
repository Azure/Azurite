
const chai = require('chai'),
    chaiHttp = require('chai-http'),
    should = chai.should();

chai.use(chaiHttp);

describe('PUT Container', () => {
    describe('Simple Container', () => {
        it('should create a container', (done) => {
            chai.request('http://localhost:10000')
                .put('/devstoreaccount1/testcontainer')
                .query({ restype: 'container' })
                .end((err, res) => {
                    should.not.exist(err);
                    res.should.have.status(200);
                    done();
                });
        });
        it('and a second with the same name that fails', (done) => {
            chai.request('http://localhost:10000')
                .put('/devstoreaccount1/testcontainer')
                .query({ restype: 'container' })
                .end((err, res) => {
                    res.should.have.status(409);
                    done();
                });
        });
    });
});