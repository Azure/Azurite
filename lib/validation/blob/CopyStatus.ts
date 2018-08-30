/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';
import { CopyStatus as CopyStat } from './../../core/Constants';

/**
 * Checks whether the a pending copy operation already exists at the destination.
 *
 * @class CopyStatus
 */
class CopyStatus {
  constructor() {}

    validate({ blobProxy = undefined }) {
        if (blobProxy !== undefined && blobProxy.original.copyStatus === CopyStat.PENDING) {
            throw ErrorCodes.PendingCopyOperation;
        }        
    }
  }
}

export default new CopyStatus();