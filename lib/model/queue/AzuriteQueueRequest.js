'use strict';

class AzuriteQueueRequest {
    constructor({
        req = undefined,
        payload = undefined }) {

        if (req === undefined) {
            throw new InternalAzuriteError('AzuriteQueueRequest: req must not be undefined!');
        }

        this.queueName = req.params.queue;
        this.messageId = req.params.messageId || undefined;
        this.metaProps = {};
        this.bodyLength = req.body ? req.body.length : 0;
        this.now = Date.now();
        this.payload = payload;
        this.numOfMessages = parseInt(req.query.numofmessages) || undefined;
        this.visibilityTimeout = parseInt(req.query.visibilityTimeout) || 0;
        this.messageTtl = parseInt(req.query.messagettl) || 60*60*24*7; // 7 days in seconds
        this.popReceipt = req.query.popreceipt || undefined;
    
        this._initMetaProps(req.rawHeaders);
    }

    // Working on rawHeaders for meta attributes to preserve casing.
    _initMetaProps(rawHeaders) {
        this.metaProps = rawHeaders.map((e, i, a) => {
            if (e.indexOf('x-ms-meta-') !== -1) {
                e = e.replace('x-ms-meta-', '');
                const o = {};
                o[e] = a[i + 1];
                return o;
            }
        }).filter((e) => {
            return e !== undefined;
        }).reduce((acc, e) => {
            const key = Object.keys(e)[0];
            acc[key] = e[key];
            return acc;
        }, {});
    }
}

module.exports = AzuriteQueueRequest;