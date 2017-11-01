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
        const now = new Date(),
            expTime = now.setSeconds(now.getSeconds() + messageTtl);
        this.msg = msg;
        this.expirationTime = expTime.toGMTString();
        this.visibilityTimeout = visibilityTimeout;
        this.timeNextVisible = undefined;
        this.messageId = uuidv4();
        this.insertionTime = now.toGMTString();
        this.popReceipt = uuidv4();
        this.dequeueConunt = 0;
    }

    renewPopReceipt() {
        this.popReceipt = uuidv4();
    }

    visible() {
        return this.timeNextVisible === undefined || new Date() > this.timeNextVisible;
    }

    updateVisibilityTimeout(visibilityTimeout) {
        this.visibilityTimeout = visibilityTimeout;
        const now = new Date(),
            timeNextVisible = now.setSeconds(now.getSeconds() + visibilityTimeout); 
        this.timeNextVisible = timeNextVisible.toGMTString();
    }
}

module.exports = Item;