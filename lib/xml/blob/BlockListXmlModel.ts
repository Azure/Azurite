import { BlockListType } from "./../../core/Constants";

export class BlockList {
  public CommittedBlocks: { Block: any[] };
  public UncommittedBlocks: { Block: any[] };
  constructor(blockListType) {
    this.CommittedBlocks = {
      Block: []
    };
    this.UncommittedBlocks = {
      Block: []
    };

    if (blockListType === BlockListType.COMMITTED) {
      delete this.UncommittedBlocks;
    }
    if (blockListType === BlockListType.UNCOMMITTED) {
      delete this.CommittedBlocks;
    }
  }
}

// tslint:disable-next-line:max-classes-per-file
export class Block {
  public Name: any;
  public Size: any;
  constructor(name, size) {
    this.Name = name;
    this.Size = size;
  }
}
