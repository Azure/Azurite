import AzuriteError from "../../core/AzuriteError";
import { LeaseStatus, Usage } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";

class BlobLeaseUsage {
  /**
   * Checks whether intended lease usage operation is semantically valid as specified
   * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-blob
   */
  public validate(request, blobProxy, moduleOptions) {
    if (blobProxy === undefined) {
      return;
    }

    const leaseId = request.leaseId();
    const usage = moduleOptions.usage;

    blobProxy.updateLeaseState();

    switch (blobProxy.original.leaseState) {
      case LeaseStatus.AVAILABLE:
        if (leaseId) {
          throw new AzuriteError(ErrorCodes.LeaseNotPresentWithBlobOperation);
        }
        break;
      case LeaseStatus.LEASED:
        if (usage === Usage.Write && leaseId === undefined) {
          throw new AzuriteError(ErrorCodes.LeaseIdMissing);
        }
        if (usage === Usage.Write && leaseId !== blobProxy.original.leaseId) {
          throw new AzuriteError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        if (
          usage === Usage.Read &&
          leaseId !== blobProxy.original.leaseId &&
          leaseId !== undefined
        ) {
          throw new AzuriteError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        break;
      case LeaseStatus.BREAKING:
        if (usage === Usage.Write && leaseId === undefined) {
          throw new AzuriteError(ErrorCodes.LeaseIdMissing);
        }
        if (usage === Usage.Write && leaseId !== blobProxy.original.leaseId) {
          throw new AzuriteError(ErrorCodes.LeaseIdMismatchWithBlobOperation);
        }
        if (
          usage === Usage.Read &&
          leaseId !== undefined &&
          leaseId !== blobProxy.original.leaseId
        ) {
          throw new AzuriteError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        break;
      case LeaseStatus.BROKEN:
        if (leaseId) {
          throw new AzuriteError(ErrorCodes.LeaseNotPresentWithBlobOperation);
        }
        break;
      case LeaseStatus.EXPIRED:
        if (leaseId) {
          throw new AzuriteError(ErrorCodes.LeaseNotPresentWithBlobOperation);
        }
        break;
    }
  }
}

export default new BlobLeaseUsage();
