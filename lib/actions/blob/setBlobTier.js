'use strict';

const storageManager = require('./../../core/blob/StorageManager'),
  //const uuidV1 = require('uuid/v1'),
  N = require('./../../core/HttpHeaderNames'),
  BlobProxy = require('./../../model/blob/BlobProxy'),
  TierType = require('./../../core/Constants').TierType;


//server = http.createServer()
class SetBlobTier {
  constructor() {
  }

  process(azuriteRequest, res) {
    storageManager.setBlobTier(azuriteRequest)
      .then((response) => {

        let statusCode;
        response.addHttpProperty(N.VERSION, '2018-03-28');
        response.addHttpProperty(N.REQUEST_ID, '8594245');

        switch ((azuriteRequest.httpProps[N.BLOB_ACCESS_TIER]).toUpperCase()) {
          case (TierType.HOT).toUpperCase():
            const { coll, blobProxy } = storageManager._getCollectionAndBlob(azuriteRequest.containerName, azuriteRequest.id);
            if(response.proxy.original.accessTier === (TierType.HOT).toUpperCase()){
              blobProxy.original.timeToRehydrate = Date.parse(new Date());
              statusCode = 202;
              break;
            }
            statusCode = 202;
            break;
          case (TierType.COOL).toUpperCase():
            statusCode = 200;
            break;
          case (TierType.ARCHIVE).toUpperCase():
            statusCode = 200;
            break;
        }

        res.set(response.httpProps);
        res.status(statusCode).send();
      });
  }
}
module.exports = new SetBlobTier();
