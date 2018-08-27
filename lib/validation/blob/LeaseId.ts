import { isUUID } from "validator";
import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

/**
 * Checks whether leaseId complies to RFC4122 (UUID) version 3-5.
 *
 * @class LeaseId
 */
class LeaseId {
  public validate(request) {
    const leaseId = request.httpProps[N.LEASE_ID];
    const proposedLeaseId = request.httpProps[N.PROPOSED_LEASE_ID];

    if (leaseId && !isUUID(leaseId, "all")) {
      throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
    }
    if (proposedLeaseId && !isUUID(proposedLeaseId, "all")) {
      throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
    }
  }
}

export default new LeaseId();
