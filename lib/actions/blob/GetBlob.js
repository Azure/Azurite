/** @format */

"use strict";

const storageManager = require("./../../core/blob/StorageManager"),
  N = require("./../../core/HttpHeaderNames"),
  EntityType = require("./../../core/Constants").StorageEntityType,
  env = require("./../../core/env"),
  req = require("request"),
  fs = require("fs-extra"),
  crypto = require("crypto");

class GetBlob {
  constructor() {}

  process(request, res) {
    const range = request.httpProps[N.RANGE];
    storageManager.getBlob(request).then((response) => {
      response.addHttpProperty(N.ACCEPT_RANGES, "bytes");
      response.addHttpProperty(N.BLOB_TYPE, response.proxy.original.entityType);
      response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
      response.addHttpProperty(
        N.CONTENT_TYPE,
        response.proxy.original.contentType
      );
      if (response.proxy.original.md5) {
        response.addHttpProperty(N.CONTENT_MD5, response.proxy.original.md5);
      }
      response.addHttpProperty(
        N.CONTENT_LANGUAGE,
        response.proxy.original.contentLanguage
      );
      response.addHttpProperty(
        N.CONTENT_ENCODING,
        response.proxy.original.contentEncoding
      );
      response.addHttpProperty(
        N.CONTENT_DISPOSITION,
        response.proxy.original.contentDisposition
      );
      response.addHttpProperty(
        N.CACHE_CONTROL,
        response.proxy.original.cacheControl
      );
      if (request.auth) response.sasOverrideHeaders(request.query);

      // If there is no precomputed md5 hash we load the entire data range into memory
      // in order to compute the MD5 hash of this chunk. We cannot use piping in this case since we cannot modify the HTTP headers
      // anymore once the response stream has started to get delivered.
      // Otherwise we just pipe the result through to the client which is more performant.
      if (!response.proxy.original.md5) {

        const fullPath = env.diskStorageUri(request.id);
        const readStream = fs.createReadStream(fullPath);
        readStream.read();
        const data = [];
        readStream.on("data", (chunk) => {
          data.push(...chunk);
        });
        readStream.on("end", () => {
          readStream.close();
          const body = new Buffer(data, "utf8");
          const hash = crypto
            .createHash("md5")
            .update(body)
            .digest("base64");
          response.addHttpProperty(N.CONTENT_MD5, hash);
          res.set(response.httpProps);
          res.status(206).send(body);
        });
      } else {
        req(this._createRequestHeader(env.webStorageUri(request.id), range))
          .on("response", (staticResponse) => {
            response.addHttpProperty(
              N.CONTENT_LENGTH,
              staticResponse.headers[N.CONTENT_LENGTH]
            );
            if (range) {
              response.httpProps[N.BLOB_CONTENT_MD5] =
                response.httpProps[N.CONTENT_MD5];
              delete response.httpProps[N.CONTENT_MD5];
              response.httpProps[N.CONTENT_RANGE] =
                staticResponse.headers[N.CONTENT_RANGE];
            }
            res.set(response.httpProps);
            range ? res.writeHead(206) : res.writeHead(200);
          })
          .pipe(res);
      }
    });
  }

  _createRequestHeader(url, range) {
    const request = {};
    request.headers = {};
    request.url = url;
    if (range) {
      request.headers.Range = range;
    }
    return request;
  }
}

module.exports = new GetBlob();
