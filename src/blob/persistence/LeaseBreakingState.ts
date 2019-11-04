import { minDate } from "../../common/utils/utils";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { LeaseStateType, LeaseStatusType } from "../generated/artifacts/models";
import Context from "../generated/Context";
import { ILease, ILeaseState } from "./ILeaseState";
import LeaseAvailableState from "./LeaseAvailableState";
import LeaseBrokenState from "./LeaseBrokenState";

export default class LeaseBreakingState implements ILeaseState {
  public readonly lease: ILease;

  public constructor(lease: ILease, private readonly context: Context) {
    /*
     * LeaseState: Breaking
     * LeaseStatus: Locked
     * LeaseDurationType: undefined
     * LeaseExpireTime: undefined
     * LeaseDurationSeconds: undefined
     * LeaseBreakTime: Now < timestamp
     * LeaseId: uuid
     */
    if (context.startTime === undefined) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, context.startTime is undefined.`
      );
    }

    if (lease.leaseState !== LeaseStateType.Breaking) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming lease state ${lease.leaseState} is not ${LeaseStateType.Breaking}.`
      );
    }

    if (lease.leaseStatus !== LeaseStatusType.Locked) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming lease status ${lease.leaseStatus} is not ${LeaseStatusType.Locked}.`
      );
    }

    if (lease.leaseId === undefined) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming leaseId ${lease.leaseId} should not be undefined.`
      );
    }

    if (lease.leaseExpireTime !== undefined) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming leaseExpireTime ${lease.leaseExpireTime} is not undefined.`
      );
    }

    if (lease.leaseDurationSeconds !== undefined) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming leaseDurationSeconds ${lease.leaseDurationSeconds} is not undefined.`
      );
    }

    if (lease.leaseDurationType !== undefined) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming leaseDurationType ${lease.leaseDurationType} is not undefined.`
      );
    }

    if (
      lease.leaseBreakTime === undefined ||
      context.startTime >= lease.leaseBreakTime // Current time should be less than break time
    ) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming leaseBreakTime ${lease.leaseBreakTime} is undefined, or larger than current time ${context.startTime}.`
      );
    }

    // Deep copy
    this.lease = { ...lease };
  }

  public acquire(duration: number, proposedLeaseId: string = ""): ILeaseState {
    throw StorageErrorFactory.getLeaseAlreadyPresent(this.context.contextId);
  }

  public break(breakPeriod?: number): ILeaseState {
    if (breakPeriod === undefined) {
      return this;
    }

    if (breakPeriod === 0) {
      return new LeaseBrokenState(
        {
          leaseId: this.lease.leaseId,
          leaseState: LeaseStateType.Broken,
          leaseStatus: LeaseStatusType.Unlocked,
          leaseDurationType: undefined,
          leaseDurationSeconds: undefined,
          leaseExpireTime: undefined,
          leaseBreakTime: undefined
        },
        this.context
      );
    }

    if (breakPeriod > 0 && breakPeriod <= 60) {
      const breakTime = new Date(
        this.context.startTime!.getTime() + breakPeriod * 1000
      );
      return new LeaseBreakingState(
        {
          leaseId: this.lease.leaseId,
          leaseState: LeaseStateType.Breaking,
          leaseStatus: LeaseStatusType.Locked,
          leaseDurationType: undefined,
          leaseDurationSeconds: undefined,
          leaseExpireTime: undefined,
          leaseBreakTime: minDate(this.lease.leaseBreakTime!, breakTime)
        },
        this.context
      );
    }

    throw StorageErrorFactory.getInvalidLeaseBreakPeriod(
      this.context.contextId
    );
  }

  public renew(): ILeaseState {
    throw StorageErrorFactory.getLeaseIsBrokenAndCannotBeRenewed(
      this.context.contextId
    );
  }

  public change(): ILeaseState {
    throw StorageErrorFactory.getLeaseIsBreakingAndCannotBeChanged(
      this.context.contextId
    );
  }

  public release(leaseId: string): ILeaseState {
    if (this.lease.leaseId !== leaseId) {
      throw StorageErrorFactory.getLeaseIdMismatchWithLeaseOperation(
        this.context.contextId
      );
    }

    return new LeaseAvailableState(
      {
        leaseId: undefined,
        leaseState: LeaseStateType.Available,
        leaseStatus: LeaseStatusType.Unlocked,
        leaseDurationType: undefined,
        leaseDurationSeconds: undefined,
        leaseExpireTime: undefined,
        leaseBreakTime: undefined
      },
      this.context
    );
  }
}
