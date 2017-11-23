'use strict';

const js2xml = require('js2xmlparser');

class QueueMessagesListXmlModel {
    constructor() {
        this.QueueMessage = [];
    }

    add(msg) {
        this.QueueMessage.push(msg);
    }

    toXml() {

        return js2xml.parse('QueueMessagesList', this);
    }
}

class QueueMessageXmlModel {
    constructor({ messageId = undefined,
        insertionTime = undefined,
        expirationTime = undefined,
        popReceipt = undefined,
        timeNextVisible = undefined,
        dequeueCount = undefined,
        messageText = undefined }) {
        this.MessageId = messageId; this.MessageId === undefined ? delete this.MessageId : (() => {/*NOOP*/ });
        this.InsertionTime = insertionTime; this.InsertionTime === undefined ? delete this.InsertionTime : (() => {/*NOOP*/ });
        this.ExpirationTime = expirationTime; this.ExpirationTime === undefined ? delete this.ExpirationTime : (() => {/*NOOP*/ });
        this.PopReceipt = popReceipt; this.PopReceipt === undefined ? delete this.PopReceipt : (() => {/*NOOP*/ });
        this.TimeNextVisible = timeNextVisible; this.TimeNextVisible === undefined ? delete this.TimeNextVisible : (() => {/*NOOP*/ });
        this.DequeueCount = dequeueCount; this.DequeueCount === undefined ? delete this.DequeueCount : (() => {/*NOOP*/ });
        this.MessageText = messageText; this.MessageText === undefined ? delete this.MessageText : (() => {/*NOOP*/ });
    }
}

module.exports = {
    QueueMessageListXmlModel: QueueMessagesListXmlModel,
    QueueMessageXmlModel: QueueMessageXmlModel
}