/** @format */

"use strict";

import AError from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import ErrorCodes from './../../core/ErrorCodes';

/**
 * Validates the 512-byte alignment of a Page Blob.
 * Given that pages must be aligned with 512-byte boundaries,
 * the start offset must be a modulus of 512 and the end offset must be a modulus of 512 – 1.
 * Examples of valid byte ranges are 0-511, 512-1023, etc.
 *
 * @class PageAlignment
 */
class PageAlignment {
  constructor() {}

  validate({ request = undefined }) {
    const range = request.httpProps[N.RANGE];
    // Range is optional
    if (!range) {
      return;
    }
    const re = new RegExp(/bytes=[0-9]+-[0-9]+/);
    if (!re.test(range)) {
      throw new AError(ErrorCodes.InvalidHeaderValue);
    }
    const parts = range.split("=")[1].split("-");
    const startByte = parseInt(parts[0]),
      endByte = parseInt(parts[1]);
    if (startByte % 512 !== 0 || (endByte + 1 - startByte) % 512 !== 0) {
      throw new AError(ErrorCodes.InvalidPageRange);
    }
  }
}

export default new PageAlignment();
