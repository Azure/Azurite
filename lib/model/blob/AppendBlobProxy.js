/** @format */

"use strict";

import crypto from 'crypto';
import BlobProxy from './BlobProxy';
import HeaderNames from './../../core/HttpHeaderNames';
import InternalAzuriteError from './../../core/InternalAzuriteError';

/**
 * Serves as a Append blob proxy to the corresponding LokiJS object.
 *
 * @class AppendBlobProxy
 */
class AppendBlobProxy extends BlobProxy {
  constructor(original, containerName) {
    super(original, container);
  }

  incrementCommittedBlockCount() {
    this.original[HeaderNames.BLOB_COMMITTED_BLOCK_COUNT] += 1;
  }
}

export default AppendBlobProxy;
