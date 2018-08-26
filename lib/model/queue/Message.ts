'use strict'

import uuidv4 from 'uuid/v4';

/**
 * Abstraction of a queue message.
 * 
 * @class Message
 */
class Message {
    /**
     * Creates an instance of message.
     * @param {String} msg the queue message.
     * @param {any} visibilityTimeout defines the time interval it is not visible to other clients
     * after it has been retrieved 
     * @param {any} messageTtl time to live of the message
     * @memberof Item
     */
    constructor(now, msg, visibilityTimeout, messageTtl) {
        this.msg = msg;
        this.expirationTime = now + messageTtl;
        this.visibilityTimeout = visibilityTimeout;
        this.timeNextVisible = now + visibilityTimeout;
        this.messageId = uuidv4();
        this.insertionTime = now;
        this.popReceipt = uuidv4();
        this.dequeueCount = 0;
    }

    renewPopReceipt() {
        this.popReceipt = uuidv4();
    }

    visible() {
        const now = Date.parse(new Date()) / 1000;
        return this.timeNextVisible === undefined || now >= this.timeNextVisible;
    }

    updateVisibilityTimeout(visibilityTimeout) {
        this.visibilityTimeout = visibilityTimeout;
        const now = Date.parse(new Date()) / 1000;
        this.timeNextVisible = now + this.visibilityTimeout;
    }
}

export default Message;