

const AError = require("./../../core/AzuriteError"),
    CopyOperationsManager = require("./../../core/blob/CopyOperationsManager"),
    ErrorCodes = require("./../../core/ErrorCodes");

/**
 *  Checks whether there is no pending copy operation. 
 * 
 * @class AbortCopy
 */
class AbortCopy {
    constructor() {
    }

    validate() {
        if (!CopyOperationsManager.isPending()) {
            throw new AError(ErrorCodes.NoPendingCopyOperation);
        }
    }
}

export default new AbortCopy();