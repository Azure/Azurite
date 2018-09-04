/** @format */

"use strict";
import storageManager from './../../core/blob/StorageManager';
import N from './../../core/HttpHeaderNames';

class PutBlock {
  constructor() {}

  process(request, res) {
    storageManager.putBlock(request).then((response) => {
      response.addHttpProperty(N.CONTENT_MD5, request.calculateContentMd5());
      response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
      res.set(response.httpProps);
      res.status(201).send();
    });
  }
}

export default new PutBlock();
