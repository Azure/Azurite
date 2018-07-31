import AzuriteError from "../../core/AzuriteError";
import { LeaseStatus, Usage } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";
import AzuriteContainerRequest from "../../model/blob/AzuriteContainerRequest";
import N from "./../../core/HttpHeaderNames";

/**
 * Checks whether intended lease usage operation is semantically valid as specified
 * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container
 *
 * @class ContainerLeaseUsage
 */
class ContainerLeaseUsage {
  public validate(
    request: AzuriteContainerRequest,
    containerProxy,
    moduleOptions
  ) {
    const leaseId = request.leaseId();
    const usage = moduleOptions.usage;

    containerProxy.updateLeaseState();

    switch (containerProxy.original.leaseState) {
      case LeaseStatus.AVAILABLE:
        if (leaseId) {
          throw new AzuriteError(
            ErrorCodes.LeaseNotPresentWithContainerOperation
          );
        }
        break;
      case LeaseStatus.LEASED:
        if (usage === Usage.Delete && !leaseId) {
          throw new AzuriteError(ErrorCodes.LeaseIdMissing);
        }
        if (
          usage === Usage.Delete &&
          leaseId !== containerProxy.original.leaseId
        ) {
          throw new AzuriteError(
            ErrorCodes.LeaseIdMismatchWithContainerOperation
          );
        }
        if (
          usage === Usage.Other &&
          leaseId !== containerProxy.original.leaseId &&
          leaseId !== undefined
        ) {
          throw new AzuriteError(
            ErrorCodes.LeaseIdMismatchWithContainerOperation
          );
        }
        break;
      case LeaseStatus.BREAKING:
        if (
          usage === Usage.Delete &&
          leaseId !== containerProxy.original.leaseId
        ) {
          throw new AzuriteError(
            ErrorCodes.LeaseIdMismatchWithContainerOperation
          );
        }
        if (usage === Usage.Delete && !leaseId) {
          throw new AzuriteError(ErrorCodes.LeaseIdMissing);
        }
        if (
          usage === Usage.Other &&
          leaseId !== containerProxy.original.leaseId &&
          leaseId !== undefined
        ) {
          throw new AzuriteError(ErrorCodes.LeaseIdMismatchWithLeaseOperation);
        }
        break;
      case LeaseStatus.BROKEN:
        if (leaseId) {
          throw new AzuriteError(
            ErrorCodes.LeaseNotPresentWithContainerOperation
          );
        }
        break;
      case LeaseStatus.EXPIRED:
        if (leaseId) {
          throw new AzuriteError(
            ErrorCodes.LeaseNotPresentWithContainerOperation
          );
        }
        break;
    }
  }
}

export default new ContainerLeaseUsage();
