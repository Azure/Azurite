'use strict';

class BlobRoute {
    constructor(app) {
        console.log("blob route con");
        app.route('/:container/:blob')
            .get((req, res) => {
                console.log('Blob Level GET');
                console.log(req.params.container);
                console.log(req.params.blob);
            })
            .post((req, res) => {

            })
            .put((req, res) => {

            });
    }
}

module.exports = BlobRoute;