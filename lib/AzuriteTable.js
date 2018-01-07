'use strict';

const express = require('express'),
    env = require('./core/env'),
    bodyParser = require('body-parser'),
    morgan = require('morgan'),
    cli = require('./core/cli');

class AzuriteTable {
    constructor() {
        this.server;
        // Support for PM2 Graceful Shutdown on Windows and Linux/OSX
        // See http://pm2.keymetrics.io/docs/usage/signals-clean-restart/
        if (process.platform === 'win32') {
            process.on('message', function (msg) {
                if (msg == 'shutdown') {
                    this.close();
                }
            });
        }
        else {
            process.on('SIGINT', function () {
                this.close();
            });
        }
    }

    init(options) {
        return env.init(options)
            .then(() => {
                const app = express();
                if (!env.silent) {
                    app.use(morgan('dev'));
                }
                app.use(bodyParser.raw({
                    inflate: true,
                    limit: '10000kb',
                    type: function (type) {
                        return true;
                    }
                }));
                require('./routes/table/TableRoute')(app);
                require('./routes/table/EntityRoute')(app);
                // app.use(require('./middleware/queue/validation'));
                // app.use(require('./middleware/queue/actions'));
                this.server = app.listen(env.tableStoragePort, () => {
                    if (!env.silent) {
                        cli.tableStorageStatus();
                    }
                });
            });
    }

    close() {
        return BbPromise.try(() => {
            this.server.close();
        });
    }
}

module.exports = AzuriteTable;