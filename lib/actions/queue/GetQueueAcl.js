'use strict';

const QueueManager = require('./../../core/queue/QueueManager'),
    js2xmlparser = require("js2xmlparser"),
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class GetQueueAcl {
    constructor() {
    }

    process(request, res) {
        const queue = QueueManager.getQueueAndMessage({ queueName: request.queueName }).queue,
            signedIdentifiers = queue.getAcl();
        let xml = js2xmlparser.parse('SignedIdentifiers', signedIdentifiers || {});
        xml = xml.replace(`<?xml version='1.0'?>`, `<?xml version="1.0" encoding="utf-8"?>`);
        const response = new AzuriteQueueResponse();
        res.set(response.httpProps);
        res.status(200).send(xml);
    }
}

module.exports = new GetQueueAcl();