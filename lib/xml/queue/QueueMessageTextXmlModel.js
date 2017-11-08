'use strict';

const BbPromise = require('bluebird'),
    AError = require('./../../core/AzuriteError'),
    ErrorCode = require('./../../core/ErrorCodes'),
    xml2jsAsync = BbPromise.promisify(require('xml2js').parseString),
    js2xml = require('js2xmlparser');

class QueueMessageText {
    constructor(msg = '') {
        this.MessageText = msg;
    }

    static toJs(body) {
        const xml = body.toString('utf8');
        return xml2jsAsync(xml)
            .then((result) => {
                return new QueueMessageText(result.QueueMessage.MessageText);
            })
            .catch((err) => {
                throw new AError(ErrorCode.InvalidXml);
            });
    }

    toXml() {
        return js2xml.parse('QueueMessage', this);
    }
}

module.exports = QueueMessageText;