/** @format */

"use strict";

import uuidV1 from "uuid/v1";
import N from "./../../core/HttpHeaderNames";
import { StorageEntityType } from "./../../core/Constants";

class AzuriteResponse {
  constructor({
    proxy = undefined,
    payload = undefined,
    query = {},
    cors = undefined,
    status = 200
  } = {}) {
    this.httpProps = {};
    this.proxy = proxy;
    this.status = status;

    if (this.proxy) {
      this.httpProps[N.ETAG] = `\"${this.proxy.original.etag}\"`;
      this.httpProps[N.LAST_MODIFIED] = this.proxy.lastModified();
      Object.keys(this.proxy.original.metaProps).forEach((key) => {
        this.httpProps[`x-ms-meta-${key}`] = this.proxy.original.metaProps[key];
      });

      if (proxy.original.entityType === StorageEntityType.AppendBlob) {
        this.httpProps[N.BLOB_COMMITTED_BLOCK_COUNT] =
          proxy.original[N.BLOB_COMMITTED_BLOCK_COUNT];
        this.httpProps[N.BLOB_APPEND_OFFSET] = proxy.original.size;
      }

      if (proxy.original.entityType === StorageEntityType.PageBlob) {
        this.httpProps[N.SEQUENCE_NUMBER] = proxy.original.sequenceNumber;
      }
    }
    this.httpProps[N.VERSION] = "2017-07-29";
    this.httpProps[N.DATE] = new Date().toGMTString();
    this.httpProps[N.CONTENT_LENGTH] = 0;
    this.httpProps[N.REQUEST_ID] = uuidV1();
    this.payload = payload;

    if (cors !== undefined) {
      this.httpProps[N.ACCESS_CONTROL_ALLOW_ORIGIN] = cors.origin;
      this.httpProps[N.ACCESS_CONTROL_EXPOSE_HEADERS] = cors.exposedHeaders;
      this.httpProps[N.ACCESS_CONTROL_ALLOW_CREDENTIALS] = true;
      this.httpProps[N.ACCESS_CONTROL_ALLOW_HEADERS] = cors.exposedHeaders;
    }
  }

  addHttpProperty(key, value) {
    if (value !== undefined) {
      this.httpProps[key] = value;
    }
  }

  sasOverrideHeaders(query) {
    this.addHttpProperty(N.CACHE_CONTROL, query.rscc);
    this.addHttpProperty(N.CONTENT_DISPOSITION, query.rscd);
    this.addHttpProperty(N.CONTENT_ENCODING, query.rsce);
    this.addHttpProperty(N.CONTENT_LANGUAGE, query.rscl);
    this.addHttpProperty(N.CONTENT_TYPE, query.rsct);
  }

  send(res) {
      this.httpProps[N.CONTENT_LENGTH] = this.payload ? this.payload.length : 0;
      res.set(this.httpProps);
      res.status(this.status);
      res.send(this.payload);
  }
}

export default AzuriteResponse;
