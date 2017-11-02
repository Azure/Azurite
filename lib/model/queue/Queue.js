'use strict';

const Item = require('./Item'),
    InternalAzuriteError = require('./../../InternalAzuriteError');

class Queue {
    constructor(metaProps = {}) {
        this.metaProps = metaProps;
        this.items = [];
    }

    put({ msg, visibilityTimeout, messageTtl }) {
        this.items.push(new Item(msg, visibilityTimeout, messageTtl));
    }

    get({ numOfMessages = 1, visibilityTimeout = 30 }) {
        const visibleItems = this.items
            .filter((i) => { return i.visible() })
            .slice(0, numOfMessages)
            .map((i) => {
                ++i.dequeueCount;
                i.updateVisibilityTimeout(visibilityTimeout)
            });
        return visibleItems;
    }

    peek(peekOnly = true) {
        const visibleItems = this.items
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
        const { index } = this._getItemAndIndex(messageId, popReceipt);
        this.items.splice(index, 1);
    }

    /**
     * The Clear Messages operation deletes all messages from the queue.
     * 
     * @memberof Queue
     */
    clear() {
        this.items = [];
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
        const { item } = this._getItemAndIndex(messageId, popReceipt);
        item.updateVisibilityTimeout(visibilityTimeout);
        item.msg = msg;
    }

    _getItemAndIndex(messageId, popReceipt) {
        const index = this.items.findIndex((i) => {
            return i.messageId === messageId;
        });
        // This should never happen due to preceding validation pipeline
        if (index === -1) {
            throw new InternalAzuriteError(`Queue: item with id [${messageId}] was unexepectedly not found.`);
        }
        const item = this.items[index];
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