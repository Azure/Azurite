'use strict';

const express = require('express'),
    env = require('./env'),
    morgan = require('morgan'),
    cli = require('./cli');

class AzuriteQueue {
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
                require('./routes/queue/QueueRoute')(app);
                require('./routes/queue/MessageRoute')(app);
                app.use(require('./middleware/queue/validation'));
                app.use(require('./middleware/queue/actions'));
                this.server = app.listen(env.queueStoragePort, () => {
                    if (!env.silent) {
                        cli.queueStorageStatus();
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

module.exports = AzuriteQueue;