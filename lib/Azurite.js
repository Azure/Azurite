'use strict';

const BbPromise = require('bluebird'),
      express = require('express'),
      path = require('path'),
      env = require('./env'),
      fs = BbPromise.promisifyAll(require("fs"));

// Global Bluebird Config
BbPromise.onPossiblyUnhandledRejection(function (err) {
	process.stderr.write(err.stack);
	process.abort();
});
BbPromise.longStackTraces();

class Azurite {
	constructor() {
		this._version = require('./../package.json').version;
	}

    init(options) {
        return BbPromise.try(() => {
            env.localStoragePath = options.l || options.location || './';
            env.port = options.p || options.port || 10000;

            let app = express();
            app.use((req, res, next) => {
                // TODO: Log sensible information about the request
                next();
            });
            require('./routes/AccountRoute')(app);
            require('./routes/ContainerRoute')(app);
            require('./routes/BlobRoute')(app);
            app.listen(env.port, function () {
                console.log('Azurite listening on port 10000!');
            });
        });
    }
}

module.exports = Azurite;