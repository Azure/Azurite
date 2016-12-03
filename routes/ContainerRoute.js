'use strict';

class ContainerRoute {
    constructor(app) {
        console.log("container roue con");
        app.route('/:container')
            .get((req, res) => {
                console.log('Container Level GET');
                console.log(req.params.container);
            })
            .post((req, res) => {

            })
            .put((req, res) => {

            });
    }
}

module.exports = ContainerRoute;