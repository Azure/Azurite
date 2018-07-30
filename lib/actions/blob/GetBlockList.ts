import * as js2xmlparser from "js2xmlparser";
import storageManager from "./../../core/blob/StorageManager";
import { BlockListType } from "./../../core/Constants";
import N from "./../../core/HttpHeaderNames";
import { Block, BlockList } from "./../../xml/blob/BlockListXmlModel";

class GetBlockList {
  public process(request, res) {
    storageManager.getBlockList(request).then(response => {
      const xml = this._transformToXml(response.payload, request.blockListType);
      response.addHttpProperty(
        N.BLOB_CONTENT_LENGTH,
        response.proxy.original.size
      );
      response.addHttpProperty(N.CONTENT_TYPE, "application/xml");
      res.status(200).send(xml);
    });
  }

  public _transformToXml(blockList, blockListType) {
    const model = new BlockList(blockListType);
    for (const block of blockList) {
      if (
        block.committed &&
        (blockListType === BlockListType.COMMITTED ||
          blockListType === BlockListType.ALL)
      ) {
        model.CommittedBlocks.Block.push(new Block(block.blockId, block.size));
      } else if (
        !block.committed &&
        (blockListType === BlockListType.UNCOMMITTED ||
          blockListType === BlockListType.ALL)
      ) {
        model.UncommittedBlocks.Block.push(
          new Block(block.blockId, block.size)
        );
      }
    }
    return js2xmlparser.parse("BlockList", model);
  }
}

export default new GetBlockList();
