const storageManager = require("./../../core/blob/StorageManager"),
  N = require("./../../core/HttpHeaderNames");

class PutAppendBlock {
  constructor() {}

  process(azuriteRequest, res) {
    storageManager.putAppendBlock(azuriteRequest).then(response => {
      response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
      response.addHttpProperty(
        N.CONTENT_MD5,
        azuriteRequest.calculateContentMd5()
      );
      response.addHttpProperty(
        N.BLOB_COMMITTED_BLOCK_COUNT,
        response.proxy.original[N.BLOB_COMMITTED_BLOCK_COUNT]
      );
      response.addHttpProperty(
        N.BLOB_APPEND_OFFSET,
        response.proxy.original.size - azuriteRequest.body.length
      );
      res.set(response.httpProps);
      res.status(201).send();
    });
  }
}

export default new PutAppendBlock();
