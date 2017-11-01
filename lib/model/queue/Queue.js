'use strict';

const Item = require('./Item');

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

    delete() {
    }

    clear() {
    }

    update() {
    }
}