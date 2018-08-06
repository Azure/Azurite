'use strict';

const crypto = require('crypto');

exports.computeEtag = (templateString) => {
    return crypto
        .createHash('sha1')
        .update(templateString, 'utf8')
        .digest('base64')
        .replace(/=+$/, '');
};

exports.releaseResourcesOnSIGINT = function () {
    if (typeof this.close !== 'function') return;

    // Support for PM2 Graceful Shutdown on Windows and Linux/OSX
    // See http://pm2.keymetrics.io/docs/usage/signals-clean-restart/
    if (process.platform === 'win32') {
        process.on('message', msg => {
            if (msg === 'shutdown') {
                this.close();
            }
        });
    }
    else {
        process.on('SIGINT', () => {
            this.close();
        });
    }
};
