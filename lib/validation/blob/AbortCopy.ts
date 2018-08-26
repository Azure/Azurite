/** @format */

import AError from './../../core/AzuriteError';
import CopyOperationsManager from './../../core/blob/CopyOperationsManager';
import ErrorCodes from './../../core/ErrorCodes';

/**
 *  Checks whether there is no pending copy operation.
 *
 * @class AbortCopy
 */
class AbortCopy {
  constructor() {}

  validate() {
    if (!CopyOperationsManager.isPending()) {
      throw new AError(ErrorCodes.NoPendingCopyOperation);
    }
  }
}

export default new AbortCopy();