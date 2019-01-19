/** @format */

"use strict";

const storageManager = require("./../../core/blob/StorageManager"),
  N = require("./../../core/HttpHeaderNames"),
  LeaseStatus = require("./../../core/Constants").LeaseStatus;

class GetBlobProperties {
  constructor() {}

  process(request, res) {
    storageManager.getBlobProperties(request).then((response) => {
      response.addHttpProperty(N.ACCEPT_RANGES, "bytes");
      response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
      response.addHttpProperty(
        N.LEASE_STATUS,
        [
          LeaseStatus.AVAILABLE,
          LeaseStatus.BROKEN,
          LeaseStatus.EXPIRED,
        ].includes(response.proxy.original.leaseState)
          ? "unlocked"
          : "locked"
      );
      response.addHttpProperty(
        N.LEASE_STATE,
        response.proxy.original.leaseState
      );
      if (response.httpProps[N.LEASE_STATE] === LeaseStatus.LEASED) {
        response.addHttpProperty(
          N.LEASE_DURATION,
          response.proxy.original.leaseDuration === -1 ? "infinite" : "fixed"
        );
      }
      response.addHttpProperty(
        N.CONTENT_TYPE,
        response.proxy.original.contentType
      );
      response.addHttpProperty(N.CONTENT_MD5, response.proxy.original.md5);
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
      response.addHttpProperty(N.BLOB_TYPE, response.proxy.original.entityType);
      response.addHttpProperty(N.CONTENT_LENGTH, response.proxy.original.size);
      response.addHttpProperty(N.COPY_ID, response.proxy.original.copyId);
      response.addHttpProperty(
        N.COPY_STATUS,
        response.proxy.original.copyStatus
      );
      response.addHttpProperty(
        N.COPY_COMPLETION_TIME,
        response.proxy.original.copyCompletionTime
      );
      response.addHttpProperty(
        N.COPY_STATUS_DESCRIPTION,
        response.proxy.original.copyStatusDescription
      );
      response.addHttpProperty(
        N.COPY_PROGRESS,
        response.proxy.original.copyProgress
      );
      response.addHttpProperty(
        N.COPY_SOURCE,
        response.proxy.original.copySource
      );
      response.addHttpProperty(
        N.INCREMENTAL_COPY,
        response.proxy.original.incrementalCopy
      );
      response.addHttpProperty(
        N.SEQUENCE_NUMBER,
        response.proxy.original.sequenceNumber
      );
      response.addHttpProperty(
        N.BLOB_COMMITTED_BLOCK_COUNT,
        response.proxy.original[N.BLOB_COMMITTED_BLOCK_COUNT]
      );
      response.addHttpProperty(
        N.BLOB_ACCESS_TIER,
        response.proxy.original.accessTier
      );
      if(response.proxy.original.timeToRehydrate !== 0){
        if((response.proxy.original.timeToRehydrate + 150000)
              < Date.parse(new Date())) {
          response.addHttpProperty(
            N.BLOB_ACCESS_TIER,
            (TierType.HOT).toUpperCase()
          );
          const { coll, blobProxy } = storageManager._getCollectionAndBlob(
            request.containerName,
            request.id
          );
          blobProxy.original.timeToRehydrate = 0;
          coll.update(blobProxy.release());
        } else {
          response.addHttpProperty(
            N.BLOB_REHYDRATE,
            'rehydrate-pending-to-hot'
          );
          response.proxy.original.accessTier = (TierType.ARCHIVE).toUpperCase();
          response.addHttpProperty(
            N.BLOB_ACCESS_TIER,
            (response.proxy.original.accessTier.toUpperCase())
          );
        }
      }
      if (request.auth) response.sasOverrideHeaders(request.query);
      res.set(response.httpProps);
      res.status(200).send();
    });
  }
}

module.exports = new GetBlobProperties();
