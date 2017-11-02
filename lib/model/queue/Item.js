'use strict'

const uuidv4 = require('uuid/v4');

/**
 * Abstraction of a Queue item.
 * 
 * @class Item
 */
class Item {
    /**
     * Creates an instance of Item.
     * @param {String} msg the queue message.
     * @param {any} visibilityTimeout defines the time interval it is not visible to other clients
     * after it has been retrieved 
     * @param {any} messageTtl time to live of the message
     * @memberof Item
     */
    constructor(msg, visibilityTimeout, messageTtl) {
        const now = Date.parse(new Date()) / 1000;
        this.msg = msg;
        this.expirationTime = now + messageTtl;
        this.visibilityTimeout = visibilityTimeout;
        this.timeNextVisible = undefined;
        this.messageId = uuidv4();
        this.insertionTime = now;
        this.popReceipt = uuidv4();
        this.dequeueConunt = 0;
    }

    renewPopReceipt() {
        this.popReceipt = uuidv4();
    }

    visible() {
        return this.timeNextVisible === undefined || Date.parse(new Date()) > this.timeNextVisible;
    }

    updateVisibilityTimeout(visibilityTimeout) {
        this.visibilityTimeout = visibilityTimeout;
        const now = Date.parse(new Date());
        this.timeNextVisible = now + this.visibilityTimeout;
    }
}

module.exports = Item;