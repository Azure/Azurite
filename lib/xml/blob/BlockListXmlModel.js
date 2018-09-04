/** @format */

"use strict";

import { BlockListType } from './../../core/Constants';

class BlockList {
  constructor(blockListType) {
    this.CommittedBlocks = {
      Block: [],
    };
    this.UncommittedBlocks = {
      Block: [],
    };

    if (blockListType === BlockListType.COMMITTED) {
      delete this.UncommittedBlocks;
    }
    if (blockListType === BlockListType.UNCOMMITTED) {
      delete this.CommittedBlocks;
    }
  }
}

class Block {
  constructor(name, size) {
    this.Name = name;
    this.Size = size;
  }
}

export default {
  BlockList: BlockList,
  Block: Block,
};
