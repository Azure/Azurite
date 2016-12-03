'use strict';

const BbPromise = require('bluebird'),
      express = require('express'),
      path = require('path'),
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

    init(argv) {
        return BbPromise.try(() => {
            let app = express();
            require('./routes/AccountRoute')(app);
            require('./routes/ContainerRoute')(app);
            require('./routes/BlobRoute')(app);
            app.listen(10000, function () {
                console.log('Azurite listening on port 10000!');
            });
        });
    }
}

module.exports = Azurite;