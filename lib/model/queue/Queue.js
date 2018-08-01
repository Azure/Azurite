'use strict';

import Message from './Message';
import InternalAzuriteError from './../../core/InternalAzuriteError';

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
                if (i.dequeueCount > 1) { // popreceipt is already been set initially
                    i.renewPopReceipt();
                }
                i.updateVisibilityTimeout(visibilityTimeout)
                return i;
            });
        return visibleItems;
    }

    peek(numOfMessages = 1) {
        const visibleItems = this.messages
            .filter((i) => { return i.visible() })
            .slice(0, numOfMessages)
            .map((i) => {
                return i;
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
    update({ messageId, popReceipt, visibilityTimeout, msg }) {
        const { item } = this._getMessageAndIndex(messageId, popReceipt);
        item.updateVisibilityTimeout(visibilityTimeout);
        item.renewPopReceipt();
        if (msg !== undefined) {
            item.msg = msg;
        }
        return item;
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

    addAcl(signedIdentifiers) {
        this.signedIdentifiers = signedIdentifiers;
    }

    getAcl() {
        return this.signedIdentifiers;
    }

    getLength() {
        return this.messages.length;
    }

    _getMessageAndIndex(messageId, popReceipt) {
        const index = this.messages.findIndex((i) => {
            return i.messageId === messageId;
        });
        // This should never happen due to preceding validation pipeline
        if (index === -1) {
            throw new InternalAzuriteError(`Queue: item with id [${messageId}] was unexpectedly not found.`);
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

export default Queue;
