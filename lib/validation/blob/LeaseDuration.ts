import AzuriteError from "../../core/AzuriteError";
import { LeaseActions } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

/**
 * Checks whether lease duration and lease break period conforms to specification
 * at https://docs.microsoft.com/en-us/rest/api/storageservices/lease-container:
 * leaseDuration: -1;[15-60]
 * leaseBreakPeriod: [0-60]
 *
 * @class LeaseDuration
 */
class LeaseDuration {
  public validate(request) {
    const leaseAction = request.httpProps[N.LEASE_ACTION];
    const leaseBreakPeriod = request.httpProps[N.LEASE_BREAK_PERIOD]
      ? parseInt(request.httpProps[N.LEASE_BREAK_PERIOD], null)
      : undefined;
    const leaseDuration = request.httpProps[N.LEASE_DURATION]
      ? parseInt(request.httpProps[N.LEASE_DURATION], null)
      : undefined;

    // x-ms-lease-duration is only required and processed for lease action "acquire"
    if (leaseAction === LeaseActions.ACQUIRE) {
      if (
        !(leaseDuration === -1 || (leaseDuration >= 15 && leaseDuration <= 60))
      ) {
        throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
      }
    }

    // x-ms-lease-break-period is optional
    if (leaseBreakPeriod) {
      if (!(leaseBreakPeriod >= 0 && leaseBreakPeriod <= 60)) {
        throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
      }
    }
  }
}

export default new LeaseDuration();
