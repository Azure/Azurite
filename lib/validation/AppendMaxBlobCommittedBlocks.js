'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class AppendMaxBlobCommittedBlocks {
    constructor() {
    }

    /**
     * Checks whether the total number of committed blocks present in this append blob does not 50,000. 
     *  
     * @param {Object} options - validation input
     * @param {Object} options.updateBlob - The name of the to be updated blob (already exists in DB) (optional)
     */
    validate(options) {
        // No more than 50.000 committed blocks?
        if (options.updateBlob.httpProps['x-ms-blob-committed-block-count'] + 1 > 50000) {
            throw new AError(ErrorCodes.BlockCountExceedsLimit);
        }
        return options;
    }
}

module.exports = new AppendMaxBlobCommittedBlocks();