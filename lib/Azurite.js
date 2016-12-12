'use strict';

const BbPromise = require('bluebird'),
    express = require('express'),
    bodyParser = require('body-parser'),
    path = require('path'),
    env = require('./env'),
    storageManager = require('./StorageManager'),
    fs = BbPromise.promisifyAll(require("fs")),
    cli = require('./cli');

// Global Bluebird Config
BbPromise.onPossiblyUnhandledRejection((err) => {
    console.log('**PANIC** Something unexpected happened! Emulator may be in an inconsistent state!');
    process.stderr.write(err.stack);
    process.abort();
});
BbPromise.longStackTraces();

class Azurite {
    constructor() {
    }

    init(options) {
        return env.init(options)
            .then(() => {
                return storageManager.init(env.localStoragePath)
            })
            .then(() => {
                let app = express();
                app.use((req, res, next) => {
                    // TODO: Log sensible information about the request
                    next();
                });
                app.use(bodyParser.raw({
                    inflate: true,
                    limit: '64000kb', // Maximum limit of size as per spec.
                    type: '*/*'
                }));
                app.use(express.static(env.localStoragePath));
                require('./routes/AccountRoute')(app);
                require('./routes/ContainerRoute')(app);
                require('./routes/BlobRoute')(app);
                app.listen(env.port, () => {
                    cli.asciiGreeting();
                });
            });
    }
}

module.exports = Azurite;