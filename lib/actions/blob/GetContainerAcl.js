/** @format */

"use strict";

import storageManager from './../../core/blob/StorageManager';
import N from './../../core/HttpHeaderNames';
import js2xmlparser from 'js2xmlparser';

class GetContainerAcl {
  constructor() {}

  process(request, res) {
    storageManager.getContainerAcl(request).then((response) => {
      if (response.proxy.original.access !== "private") {
        response.addHttpProperty(
          N.BLOB_PUBLIC_ACCESS,
          response.proxy.original.access
        );
      }
      response.addHttpProperty(N.CONTENT_TYPE, "application/xml");
      res.set(response.httpProps);
      let xml = js2xmlparser.parse(
        "SignedIdentifiers",
        response.proxy.original.signedIdentifiers || {}
      );
      xml = xml.replace(
        `<?xml version='1.0'?>`,
        `<?xml version="1.0" encoding="utf-8"?>`
      );
      res.status(200).send(xml);
    });
  }
}

export default new GetContainerAcl();
