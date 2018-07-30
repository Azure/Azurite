import uuid from "uuid";
import { StorageEntityType } from "../../core/Constants";
import N from "../../core/HttpHeaderNames";

class AzuriteResponse {
  public httpProps: any;
  public proxy: any;
  public payload: any;
  constructor({ proxy, payload, query = {}, cors } = {}) {
    this.httpProps = {};
    this.proxy = proxy;
    if (this.proxy) {
      this.httpProps[N.ETAG] = `\"${this.proxy.original.etag}\"`;
      this.httpProps[N.LAST_MODIFIED] = this.proxy.lastModified();
      Object.keys(this.proxy.original.metaProps).forEach(key => {
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
    this.httpProps[N.VERSION] = "2016-05-31";
    this.httpProps[N.DATE] = new Date().toUTCString();
    this.httpProps[N.CONTENT_LENGTH] = 0;
    this.httpProps[N.REQUEST_ID] = uuid.v1();
    this.payload = payload;

    if (cors !== undefined) {
      this.httpProps[N.ACCESS_CONTROL_ALLOW_ORIGIN] = cors.origin;
      this.httpProps[N.ACCESS_CONTROL_EXPOSE_HEADERS] = cors.exposedHeaders;
      this.httpProps[N.ACCESS_CONTROL_ALLOW_CREDENTIALS] = true;
      this.httpProps[N.ACCESS_CONTROL_ALLOW_HEADERS] = cors.exposedHeaders;
    }
  }

  public addHttpProperty(key, value) {
    if (value !== undefined) {
      this.httpProps[key] = value;
    }
  }

  public sasOverrideHeaders(query) {
    this.addHttpProperty(N.CACHE_CONTROL, query.rscc);
    this.addHttpProperty(N.CONTENT_DISPOSITION, query.rscd);
    this.addHttpProperty(N.CONTENT_ENCODING, query.rsce);
    this.addHttpProperty(N.CONTENT_LANGUAGE, query.rscl);
    this.addHttpProperty(N.CONTENT_TYPE, query.rsct);
  }
}

export default AzuriteResponse;
