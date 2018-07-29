const AError = from "./../../core/AzuriteError"),
  CopyOperationsManager = from "./../../core/blob/CopyOperationsManager"),
  ErrorCodes = from "./../../core/ErrorCodes");

/**
 *  Checks whether there is no pending copy operation.
 *
 * @class AbortCopy
 */
class AbortCopy {
  public validate() {
    if (!CopyOperationsManager.isPending()) {
      throw new AError(ErrorCodes.NoPendingCopyOperation);
    }
  }
}

export default new AbortCopy();
