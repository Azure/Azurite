'use strict';

class BlockList {
    constructor(blockListType) {
        this.committedblocks = {
            block: []
        }
        this.uncommittedblocks = {
            block: []
        }

        if (blockListType === 'committed') {
            delete this.uncommittedblocks;
        }
        if (blockListType === 'uncommitted') {
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