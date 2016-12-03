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
        this.config = {
			ROUTE_HANDLER_PATH: __dirname + '/../routes'
		}
	}

    init(argv) {
        let app = express();
        fs.readdirAsync(this.config.ROUTE_HANDLER_PATH)
			.then((files) => {
				files.forEach((file, index) => {
                    let handler = require(path.join(this.config.ROUTE_HANDLER_PATH, file));
                    new handler(app);
				});
			}).then(() => {
                app.listen(10000, function () {
                    console.log('Azurite listening on port 10000!')
                });
            })
			.catch(function (e) {
				throw new Error('Could not initialize route handlers: ' + JSON.stringify(e));
			});
    }
}

module.exports = Azurite;