'use strict';

const BlockListType = require('./../Constants').BlockListType;

class BlockList {
    constructor(blockListType) {
        this.committedblocks = {
            block: []
        }
        this.uncommittedblocks = {
            block: []
        }

        if (blockListType === BlockListType.COMMITTED) {
            delete this.uncommittedblocks;
        }
        if (blockListType === BlockListType.UNCOMMITTED) {
            delete this.committedblocks;
        }
    }
}

class Block {
    constructor(name, size) {
        this.name = name;
        this.size = size;
    }
}

module.exports = {
    BlockList: BlockList,
    Block: Block
}