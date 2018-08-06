'use strict';

const express = require('express'),
    BbPromise = require('bluebird'),
    env = require('./core/env'),
    bodyParser = require('body-parser'),
    morgan = require('morgan'),
    tableStorageManager = require('./core/table/TableStorageManager'),
    cli = require('./core/cli'),
    { releaseResourcesOnSIGINT } = require('./core/utils');

class AzuriteTable {
    constructor() {
        this.server;
        releaseResourcesOnSIGINT.call(this);
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
                require('./routes/table/TableRoute')(app);
                require('./routes/table/EntityRoute')(app);
                app.use(require('./middleware/table/validation'));
                app.use(require('./middleware/table/actions'));
                this.server = app.listen(env.tableStoragePort, () => {
                    if (!env.silent) {
                        cli.tableStorageStatus();
                    }
                });
            });
    }

    close() {
        return BbPromise.promisify(this.server.close.bind(this.server))()
            .then(() => tableStorageManager.flush())
            .then(() => tableStorageManager.close());
    }
}

module.exports = AzuriteTable;
