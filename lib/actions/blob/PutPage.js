/** @format */

"use strict";

const storageManager = require("./../../core/blob/StorageManager"),
  N = require("./../../core/HttpHeaderNames");

class PutPage {
  constructor() {}

  process(request, res) {
    storageManager.putPage(request).then((response) => {
      response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
      res.set(response.httpProps);
      res.status(201).send();
    });
  }
}

module.exports = new PutPage();
