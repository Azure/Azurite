

const storageManager = require("./../../core/blob/StorageManager"),
    N = require("./../../core/HttpHeaderNames"),
    BlockListType = require("./../../core/Constants").BlockListType,
    js2xmlparser = require("js2xmlparser"),
    Model = require("./../../xml/blob/BlockListXmlModel");


class GetBlockList {
    constructor() {
    }

    process(request, res) {
        storageManager.getBlockList(request)
            .then((response) => {
                const xml = this._transformToXml(response.payload, request.blockListType);
                response.addHttpProperty(N.BLOB_CONTENT_LENGTH, response.proxy.original.size);
                response.addHttpProperty(N.CONTENT_TYPE, "application/xml");
                res.status(200).send(xml);
            });
    }

    _transformToXml(blockList, blockListType) {
        const model = new Model.BlockList(blockListType);
        for (const block of blockList) {
            if (block.committed && (blockListType === BlockListType.COMMITTED || blockListType === BlockListType.ALL)) {
                model.CommittedBlocks.Block.push(new Model.Block(block.blockId, block.size));
            } else if (!block.committed && (blockListType === BlockListType.UNCOMMITTED || blockListType === BlockListType.ALL)) {
                model.UncommittedBlocks.Block.push(new Model.Block(block.blockId, block.size));
            }
        }
        return js2xmlparser.parse("BlockList", model);
    }
}

export default new GetBlockList();