'use strict';

import express from 'express';
import env from './core/env';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import tableStorageManager from './core/table/TableStorageManager';
import * as cli from './core/cli';
import * as BbPromise from 'bluebird';
import TableRoute from './routes/table/TableRoute';
import EntityRoute from './routes/table/EntityRoute';
import validation from './middleware/table/validation';
import actions from './middleware/table/actions';

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
                return tableStorageManager.init()
            })
            .then(() => {
                const app = express();
                if (!env.silent) {
                    app.use(morgan('dev'));
                }
                app.use(bodyParser.raw({
                    inflate: true,
                    // According to https://docs.microsoft.com/en-us/rest/api/storageservices/understanding-the-table-service-data-model
                    // maximum size of an entity is 1MB
                    limit: '10000kb',
                    type: function (type) {
                        return true;
                    }
                }));
                TableRoute(app);
                EntityRoute(app);
                app.use(validation);
                app.use(actions);
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
            tableStorageManager.flush();
            return tableStorageManager.close();
        });
    }
}

export default AzuriteTable;