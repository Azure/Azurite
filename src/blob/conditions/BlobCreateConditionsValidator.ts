import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import BlobLeaseAdapter from "../lease/BlobLeaseAdapter";
import BlobWriteLeaseSyncer from "../lease/BlobWriteLeaseSyncer";
import BlobWriteLeaseValidator from "../lease/BlobWriteLeaseValidator";
import LeaseFactory from "../lease/LeaseFactory";
import { BlobModel } from "../persistence/IBlobMetadataStore";

export default function validateAndSyncBlobCreateConditions(
  context: Context,
  existingBlob: BlobModel,
  destinationBlob: BlobModel,
  leaseAccessConditions?: Models.LeaseAccessConditions,
  modifiedAccessConditions?: Models.ModifiedAccessConditions
): void {
  const leaseState = LeaseFactory.createLeaseState(
    new BlobLeaseAdapter(existingBlob),
    context
  );
  leaseState.validate(new BlobWriteLeaseValidator(leaseAccessConditions));

  // Azure validates an active lease before reporting that the blob exists.
  if (modifiedAccessConditions?.ifNoneMatch === "*") {
    throw StorageErrorFactory.getBlobAlreadyExists(context.contextId);
  }

  leaseState.sync(new BlobWriteLeaseSyncer(destinationBlob));
}
