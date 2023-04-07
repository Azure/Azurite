import { LeaseStateType } from "../generated/artifacts/models";
import Context from "../generated/Context";
import { ILease, ILeaseState } from "./ILeaseState";
import LeaseAvailableState from "./LeaseAvailableState";
import LeaseBreakingState from "./LeaseBreakingState";
import LeaseBrokenState from "./LeaseBrokenState";
import LeaseExpiredState from "./LeaseExpiredState";
import LeaseLeasedState from "./LeaseLeasedState";

export default class LeaseFactory {
  public static createLeaseState(lease: ILease, context: Context): ILeaseState {
    if (context.startTime === undefined) {
      throw new RangeError(
        `LeaseFactory:createLeaseState() context.startTime should not be undefined.`
      );
    }

    if (
      lease.leaseState === LeaseStateType.Available ||
      lease.leaseState === undefined
    ) {
      return new LeaseAvailableState(lease, context);
    }

    if (lease.leaseState === LeaseStateType.Leased) {
      if (
        lease.leaseExpireTime === undefined ||
        context.startTime < lease.leaseExpireTime
      ) {
        return new LeaseLeasedState(lease, context);
      } else {
        return new LeaseExpiredState(lease, context);
      }
    }

    if (lease.leaseState === LeaseStateType.Expired) {
      return new LeaseExpiredState(lease, context);
    }

    if (lease.leaseState === LeaseStateType.Breaking) {
      if (lease.leaseBreakTime === undefined) {
        throw new RangeError(
          `LeaseFactory:createLeaseState() leaseBreakTime should not be undefined when leaseState is ${LeaseStateType.Breaking}.`
        );
      }
      if (context.startTime < lease.leaseBreakTime) {
        return new LeaseBreakingState(lease, context);
      } else {
        return new LeaseBrokenState(lease, context);
      }
    }

    if (lease.leaseState === LeaseStateType.Broken) {
      return new LeaseBrokenState(lease, context);
    }

    throw new RangeError(
      `LeaseFactory:createLeaseState() Cannot create LeaseState instance from lease ${JSON.stringify(
        lease
      )}`
    );
  }
}
