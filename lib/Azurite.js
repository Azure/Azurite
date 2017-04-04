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
                // According to RFC 7231:
                // An origin server MAY respond with a status code of 415 (Unsupported
                // Media Type) if a representation in the request message has a content
                // coding that is not acceptable.
                // body-parser, however, throws an error. We thus ignore unsupported content encodings and treat them as 'identity'.
                app.use(function (req, res, next) {
                    let encoding = (req.headers['content-encoding'] || 'identity').toLowerCase();
                    if (encoding !== 'deflate' ||
                        encoding !== 'gzip' ||
                        encoding !== 'identity') {
                        delete req.headers['content-encoding'];
                    }
                    next();
                })
                app.use(bodyParser.raw({
                    inflate: true,
                    limit: '268435kb', // Maximum size of a single PUT Blob operation as per spec.
                    type: function (type) {
                        return true;
                    }
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