/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import CopyOperationsManager from './../../core/blob/CopyOperationsManager';
import { ErrorCodes } from '../../core/AzuriteError';

/**
 *  Checks whether there is no pending copy operation.
 *
 * @class AbortCopy
 */
class AbortCopy {
  constructor() {}

    validate() {
        // TODO
        // if (!CopyOperationsManager.isPending()) {
        //     throw ErrorCodes.NoPendingCopyOperation);
        // }
    }
  }
}

export default new AbortCopy();