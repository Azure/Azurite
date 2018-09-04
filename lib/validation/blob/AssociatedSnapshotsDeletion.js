/** @format */

"use strict";

import AError from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import ErrorCodes from './../../core/ErrorCodes';

/*
 * Checks whether the blob to be deleted has any associated snapshots and - if this is true - has according
 * x-ms-delete-snapshots header specified.
 * Also checks whether above header is specified on a blob (valid) or a snapshot (not valid).
 */
class AssociatedSnapshotsDeletion {
  constructor() {}

  validate({ request = undefined, moduleOptions = undefined }) {
    // If a snapshot is requested to be deleted this validation rule is not relevant
    if (request.isSnapshot()) {
      return;
    }

    const collection = moduleOptions.collection;
    // This header (x-ms-delete-snapshots) should be specified only for a request against the base blob resource.
    // If this header is specified on a request to delete an individual snapshot, the Blob service returns status code 400 (Bad Request).
    if (
      request.httpProps[N.DELETE_SNAPSHOTS] !== undefined &&
      request.isSnapshot()
    ) {
      throw new AError(ErrorCodes.UnsupportedHeader);
    }

    // If this header (x-ms-delete-snapshots) is not specified on the request and the blob has associated snapshots, the Blob service returns status code 409 (Conflict).
    const snapshots = collection
      .chain()
      .find({ originId: { $eq: request.id } })
      .data();
    // If the blob has associated snapshots...
    if (snapshots.length > 0) {
      // return 409 (Conflict) if header (x-ms-delete-snapshots) is not specified on the request
      if (request.httpProps[N.DELETE_SNAPSHOTS] === undefined) {
        throw new AError(ErrorCodes.SnapshotsPresent);
      }
      // return 400 (Error) if header (x-ms-delete-snapshots) has invalid values
      if (
        request.httpProps[N.DELETE_SNAPSHOTS] !== "include" &&
        request.httpProps[N.DELETE_SNAPSHOTS] !== "only"
      ) {
        throw new AError(ErrorCodes.InvalidHeaderValue);
      }
    }
  }
}

export default new AssociatedSnapshotsDeletion();
