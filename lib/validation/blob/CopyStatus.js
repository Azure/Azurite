/** @format */

"use strict";

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';
import { CopyStatus as CopyStat } from './../../core/Constants';

/**
 * Checks whether the a pending copy operation already exists at the destination.
 *
 * @class CopyStatus
 */
class CopyStatus {
  constructor() {}

  validate({ blobProxy = undefined }) {
    if (
      blobProxy !== undefined &&
      blobProxy.original.copyStatus === CopyStat.PENDING
    ) {
      throw new AError(ErrorCodes.PendingCopyOperation);
    }
  }
}

export default new CopyStatus();
