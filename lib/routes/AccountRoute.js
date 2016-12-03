'use strict';

class AccountRoute {
    constructor(app) {
        console.log("Account Rozte cons");
        app.route('/devstoreaccount1')
            .get((req, res) => {
                console.log('Account Level GET');
            })
            .post((req, res) => {

            })
            .put((req, res) => {

            });
    }
}

module.exports = AccountRoute;