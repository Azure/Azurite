'use strict';

import express from 'express';
import env from './core/env';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import * as cli from './core/cli';
import BbPromise from 'bluebird';
import AccountRoute from './routes/queue/AccountRoute';
import QueueRoute from './routes/queue/QueueRoute';
import MessageRoute from './routes/queue/MessageRoute';
import validation from './middleware/queue/validation';
import actions from './middleware/queue/actions';

class AzuriteQueue {
    server: any;
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
                AccountRoute(app);
                QueueRoute(app);
                MessageRoute(app);
                app.use(validation);
                app.use(actions);
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

export default AzuriteQueue;