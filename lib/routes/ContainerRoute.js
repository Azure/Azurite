'use strict';

const createContainerHandler = require('./../api/CreateContainer'),
    env = require('./../env');

class ContainerRoute {
    constructor(app) {
        console.log("container roue con");
        app.route(`/${env.emulatedStorageAccountName}/:container`)
            .get((req, res) => {
            })
            .post((req, res) => {

            })
            .put((req, res) => {
                createContainerHandler.process();
            });
    }
}

module.exports = ContainerRoute;