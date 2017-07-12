'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

/*
 * Checks whether the blob to be deleted has any associated snapshots and - if this is true - has according
 * x-ms-delete-snapshots header specified.
 * Also checks whether above header is specified on a blob (valid) or a snapshot (not valid).
 */
class AssociatedSnapshotsDeletion {
    constructor() {
    }

    /**
     * @param {Object} options - validation input
     * @param {Object} options.collection - Reference to in-memory database
     * @param {String} options.requestBlob - The blob to be checked
     */
    validate(options) {
        const blob = options.requestBlob,
            collection = options.collection;

        // This header (x-ms-delete-snapshots) should be specified only for a request against the base blob resource.
        // If this header is specified on a request to delete an individual snapshot, the Blob service returns status code 400 (Bad Request).
        if (blob.httpProps['x-ms-delete-snapshots'] !== undefined && blob.isSnapshot()) {
            throw new AError(ErrorCodes.UnsupportedHeader);
        }

        // If this header (x-ms-delete-snapshots) is not specified on the request and the blob has associated snapshots, the Blob service returns status code 409 (Conflict).
        const snapshots = collection.chain().find({ 'origin': { '$eq': blob.name } }).data();
        // If the blob has associated snapshots...
        if (snapshots.length > 0) {
            // return 409 (Conflict) if header (x-ms-delete-snapshots) is not specified on the request
            if (blob.httpProps['x-ms-delete-snapshots'] === undefined) {
                throw new AError(ErrorCodes.SnapshotsPresent);
            }
            // return 400 (Error) if header (x-ms-delete-snapshots) has invalid values
            if (blob.httpProps['x-ms-delete-snapshots'] !== 'include' || blob.httpProps['x-ms-delete-snapshots'] !== 'only') {
                throw new AError(ErrorCodes.InvalidHeaderValue);
            }
        }
    }
}

module.exports = new AssociatedSnapshotsDeletion();