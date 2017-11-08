'use strict';

const js2xml = require('js2xmlparser');

class QueueMessagesListXmlModel {
    constructor() {
        this.QueueMessagesList = {
            QueueMessage: []
        }
    }

    add(msg) {
        this.QueueMessagesList.QueueMessage.push(msg);
    }

    toXml() {
        return js2xml.parse('QueueMessagesList', this);
    }
}

class QueueMessageXmlModel {
    constructor({ messageId = '', insertionTime = '', expirationTime = '', popReceipt = '', timeNextVisible = '' }) {
        this.MessageId = messageId;
        this.InsertionTime = insertionTime;
        this.ExpirationTime = expirationTime;
        this.PopReceipt = popReceipt;
        this.TimeNextVisible = timeNextVisible;
    }
}

module.exports = {
    QueueMessageListXmlModel: QueueMessagesListXmlModel,
    QueueMessageXmlModel: QueueMessageXmlModel
}