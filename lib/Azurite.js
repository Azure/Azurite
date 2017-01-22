'use strict';

const BbPromise = require('bluebird'),
    express = require('express'),
    bodyParser = require('body-parser'),
    path = require('path'),
    env = require('./env'),
    storageManager = require('./StorageManager'),
    fs = BbPromise.promisifyAll(require("fs")),
    morgan = require('morgan'),
    cli = require('./cli');

class Azurite {
    constructor() {
        this.server;
    }

    init(options) {
        return env.init(options)
            .then(() => {
                return storageManager.init(env.localStoragePath)
            })
            .then(() => {
                let app = express();
                if (!env.silent) {
                    app.use(morgan('dev'));
                }
                app.use(bodyParser.raw({
                    inflate: true,
                    limit: '268435kb', // Maximum size of a single PUT Blob operation as per spec.
                    type: function(type) { return true; }
                }));
                app.use(express.static(env.localStoragePath));
                require('./routes/AccountRoute')(app);
                require('./routes/ContainerRoute')(app);
                require('./routes/BlobRoute')(app);
                this.server = app.listen(env.port, () => {
                    if (!env.silent) {
                        cli.asciiGreeting();
                    }
                });
            });
    }

    close() {
        return BbPromise.try(() => {
            this.server.close();
        })
    }
}

module.exports = Azurite;