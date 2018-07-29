

const AError = require("./../../core/AzuriteError"),
    ErrorCodes = require("./../../core/ErrorCodes"),
    CopyStat = require("./../../core/Constants").CopyStatus;

/**
 * Checks whether the a pending copy operation already exists at the destination.
 * 
 * @class CopyStatus
 */
class CopyStatus {
    constructor() {
    }

    validate({ blobProxy = undefined }) {
        if (blobProxy !== undefined && blobProxy.original.copyStatus === CopyStat.PENDING) {
            throw new AError(ErrorCodes.PendingCopyOperation);
        }        
    }
}

export default new CopyStatus();