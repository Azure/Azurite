'use strict';

const express = require('express'),
    env = require('./core/env'),
    bodyParser = require('body-parser'),
    morgan = require('morgan'),
    cli = require('./core/cli'),    
    BbPromise = require('bluebird'),
    { releaseResourcesOnSIGINT } = require('./core/utils');

class AzuriteQueue {
    constructor() {
        this.server;
        releaseResourcesOnSIGINT.call(this);
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
                require('./routes/queue/AccountRoute')(app);
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
        return BbPromise.promisify(this.server.close.bind(this.server))();
    }
}

module.exports = AzuriteQueue;
