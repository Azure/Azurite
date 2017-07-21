'use strict';

const storageManager = require('./../StorageManager'),
    js2xmlparser = require('js2xmlparser'),
    ResponseHeader = require('./../model/ResponseHeader'),
    Blob = require('./../model/Blob'),
    Model = require('./../model/BlockListXmlModel');


class GetBlockList {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        // Valid values are 'committed' (default), 'uncommitted', and 'all'
        const blob = new Blob(blobName, req.headers);
        const blockListType = req.query.blocklisttype || 'committed';
        storageManager.getBlockList(containerName, blob, blockListType)
            .then((result) => {
                const xml = this._transformToXml(result.blocks, blockListType);
                res.set(new ResponseHeader(result.parentBlob.httpProps, null, { 'x-ms-blob-content-length': result.parentBlob.size, 'Content-Type': 'application/xml' }));
                res.status(200).send(xml);
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }

    _transformToXml(blockList, blockListType) {
        let model = new Model.BlockList(blockListType);
        for (let block of blockList) {
            if (block.committed && (blockListType === 'committed' || blockListType === 'all')) {
                model.committedblocks.block.push(new Model.Block(block.blockId, block.size));
            } else if (!block.committed && (blockListType === 'uncommitted' || blockListType === 'all')) {
                model.uncommittedblocks.block.push(new Model.Block(block.blockId, block.size));
            }
        }
        return js2xmlparser.parse('blocklist', model);
    }
}

module.exports = new GetBlockList();