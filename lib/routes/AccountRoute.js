'use strict';

let env = require('./../env');

class AccountRoute {
    constructor(app) {
        console.log("Account Route");
        app.route(`/${env.emulatedStorageAccountName}`)
            .get((req, res) => {
                let c = req.param.comp;
                console.log(c);
            })
            .post((req, res) => {

            })
            .put((req, res) => {

            });
    }
}

module.exports = AccountRoute;