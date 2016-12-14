'use strict';

const storageManager = require('./../StorageManager'),
    js2xmlparser = require('js2xmlparser'),
    Model = require('./../model/BlockListXmlModel');


class GetBlockList {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        // Valid values are 'committed' (default), 'uncommitted', and 'all'
        const blockListType = req.query.blocklisttype || 'committed';
        storageManager.getBlockList(containerName, blobName, blockListType)
            .then((result) => {
                const xml = this._transformToXml(result.blocks, blockListType);
                this._addHeader(res, result.parentBlob);
                res.status(200).send(xml);
            })
            .catch((e) => {
                // A read operation cannot leave DB and disk storage in an inconsistent state, 
                // thus we do not abort the process by re-throwing an error.
                res.status(500).send();
                console.error(e);
            });
    }

    _addHeader(res, parentBlob) {
        const httpProps = parentBlob.http_props;
        res.set({
            'Last-Modified': httpProps.lastModified,
            'ETag': httpProps.ETag,
            'Content-Type': httpProps['Content-Type'] || 'application/xml', // as per spec
            'x-ms-blob-content-length': parentBlob.size
        });
    }

    _transformToXml(blockList, blockListType) {
        let model = new Model.BlockList(blockListType);
        for (let block of blockList) {
            if (block.committed && (blockListType === 'committed' || blockListType === 'all')) {
                model.committedblocks.block.push(new Model.Block(block.blockId, block.size));
            } else if(!block.committed && (blockListType === 'uncommitted' || blockListType === 'all')) {
                model.uncommittedblocks.block.push(new Model.Block(block.blockId, block.size));
            }
        }
        return js2xmlparser.parse('blocklist', model);
    }
}

module.exports = new GetBlockList();