'use strict';

const Message = require('./Message'),
    InternalAzuriteError = require('./../../core/InternalAzuriteError');

class Queue {
    constructor(metaProps = {}) {
        this.metaProps = metaProps;
        this.messages = [];
    }

    put({ now, msg, visibilityTimeout, messageTtl }) {
        const message = new Message(now, msg, visibilityTimeout, messageTtl);
        this.messages.push(message);
        return message;
    }

    gett({ numOfMessages = 1, visibilityTimeout = 30 }) {
        const visibleItems = this.messages
            .filter((i) => { return i.visible() })
            .slice(0, numOfMessages)
            .map((i) => {
                ++i.dequeueCount;
                i.updateVisibilityTimeout(visibilityTimeout)
                return i;
            });
        return visibleItems;
    }

    peek(peekOnly = true) {
        const visibleItems = this.messages
            .filter((i) => { return i.visible() })
            .slice(0, numOfMessages)
            .map((i) => {
                if (!peekOnly) {
                    i.updateVisibilityTimeout(visibilityTimeout)
                }
            });
        return visibleItems;
    }

    /**
     * The Delete Message operation deletes the specified message. Since validity of @param popReceipt is validated
     * in the queue emulators validation middleware, we assume that it is valid (otherwise it throws @/// <reference path="./../../InternalAzuriteError" />). 
     * 
     * @param {any} messageId 
     * @param {any} popReceipt 
     * @memberof Queue
     */
    delete(messageId, popReceipt) {
        const { index } = this._getMessageAndIndex(messageId, popReceipt);
        this.messages.splice(index, 1);
    }

    /**
     * The Clear Messages operation deletes all messages from the queue.
     * 
     * @memberof Queue
     */
    clear() {
        this.messages = [];
    }

    /**
     * The Update Message operation updates the visibility timeout of a message, and the contents of a message.
     * 
     * @param {any} messageId 
     * @param {any} popReceipt 
     * @param {any} visibilityTimeout 
     * @param {any} msg 
     * @memberof Queue
     */
    update(messageId, popReceipt, visibilityTimeout, msg) {
        const { item } = this._getMessageAndIndex(messageId, popReceipt);
        item.updateVisibilityTimeout(visibilityTimeout);
        item.msg = msg;
    }

    /**
     * Returns the message with the specified messageId.
     * 
     * @param {any} messageId 
     * @returns the according message, undefined if it does not exist.
     * @memberof Queue
     */
    getMessage(messageId) {
        const index = this.messages.findIndex((i) => {
            return i.messageId === messageId;
        });
        return this.messages[index];
    }

    _getMessageAndIndex(messageId, popReceipt) {
        const index = this.messages.findIndex((i) => {
            return i.messageId === messageId;
        });
        // This should never happen due to preceding validation pipeline
        if (index === -1) {
            throw new InternalAzuriteError(`Queue: item with id [${messageId}] was unexepectedly not found.`);
        }
        const item = this.messages[index];
        // This should never happen due to preceding validation pipeline
        if (item.popReceipt !== popReceipt) {
            throw new InternalAzuriteError(`Queue: passed popReceipt [${popReceipt}] is unexpectedly different from item's popReceipt [${item.popReceipt}]`);
        }

        return {
            item: item,
            index: index
        };
    }


}

module.exports = Queue;