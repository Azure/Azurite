/** @format */

"use strict";
const N = require("./../../core/HttpHeaderNames");

import storageManager from './../../core/blob/StorageManager';
import js2xmlparser from 'js2xmlparser';

class GetBlobServiceProperties {
  constructor() {}

  process(request, res) {
    storageManager.getBlobServiceProperties(request).then((response) => {
      const xml = js2xmlparser.parse(
        "StorageServiceProperties",
        response.payload.StorageServiceProperties || []
      );
      response.addHttpProperty(N.CONTENT_TYPE, "application/xml");
      response.addHttpProperty(N.CONTENT_LENGTH, xml.length);
      res.set(response.httpProps);
      res.status(200).send(xml);
    });
  }
}

export default new GetBlobServiceProperties();
