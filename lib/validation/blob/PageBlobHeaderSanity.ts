/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import { ErrorCodes } from '../../core/AzuriteError';

class PageBlobHeaderSanity {
  constructor() {}

  validate({ request = undefined }) {
    const httpProps = request.httpProps;
    let pageWrite = httpProps[N.PAGE_WRITE];

    if (!pageWrite) {
      throw new AError(ErrorCodes.InvalidHeaderValue);
    }

    pageWrite = pageWrite.toLowerCase();

    if (!(pageWrite === "clear" || pageWrite === "update")) {
      throw new AError(ErrorCodes.InvalidHeaderValue);
    }

    const isClearSet = pageWrite === "clear";
    if (isClearSet && httpProps[N.CONTENT_LENGTH] != 0) {
      throw new AError(ErrorCodes.InvalidHeaderValue);
    }
    if (isClearSet && httpProps[N.CONTENT_MD5]) {
      throw new AError(ErrorCodes.InvalidHeaderValue);
    }

    validate({ request = undefined }) {
        const httpProps = request.httpProps;
        let pageWrite = httpProps[N.PAGE_WRITE];

        if (!pageWrite) {
            throw ErrorCodes.InvalidHeaderValue;
        }

        pageWrite = pageWrite.toLowerCase();

        if (!(pageWrite === 'clear' || pageWrite === 'update')) {
            throw ErrorCodes.InvalidHeaderValue;
        }

        const isClearSet = pageWrite === 'clear';
        if (isClearSet && httpProps[N.CONTENT_LENGTH] != 0) {
            throw ErrorCodes.InvalidHeaderValue;
        }
        if (isClearSet && httpProps[N.CONTENT_MD5]) {
            throw ErrorCodes.InvalidHeaderValue;
        }

        const range = httpProps[N.RANGE];
        // This is safe since range string has already been validated to be well-formed
        // in PageAlignment Validator.
        const parts = range.split('=')[1].split('-');
        if (!isClearSet) {
            const startByte = parseInt(parts[0]),
                endByte = parseInt(parts[1]);
            if (httpProps[N.CONTENT_LENGTH] != (endByte - startByte) + 1) {
                throw ErrorCodes.InvalidHeaderValue;
            }
        }
    }
  }
}

export default new PageBlobHeaderSanity;
