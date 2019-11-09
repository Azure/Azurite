import uuid = require("uuid");

import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  LeaseDurationType,
  LeaseStateType,
  LeaseStatusType
} from "../generated/artifacts/models";
import Context from "../generated/Context";
import { ILease, ILeaseState } from "./ILeaseState";
import LeaseAvailableState from "./LeaseAvailableState";
import LeaseBrokenState from "./LeaseBrokenState";
import LeaseLeasedState from "./LeaseLeasedState";
import LeaseStateBase from "./LeaseStateBase";

export default class LeaseExpiredState extends LeaseStateBase {
  public constructor(lease: ILease, context: Context) {
    if (context.startTime === undefined) {
      throw RangeError(
        `LeaseExpiredState:constructor() error, context.startTime is undefined.`
      );
    }

    if (lease.leaseState === LeaseStateType.Expired) {
      /*
       * LeaseState: Expired
       * LeaseStatus: Unlocked
       * LeaseDurationType: undefined
       * LeaseExpireTime: undefined
       * LeaseDurationSeconds: number
       * LeaseBreakTime: undefined
       * LeaseId: uuid
       */
      if (lease.leaseStatus !== LeaseStatusType.Unlocked) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming lease status ${lease.leaseStatus} is not ${LeaseStatusType.Unlocked}.`
        );
      }

      if (lease.leaseId === undefined) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseId ${lease.leaseId} should not be undefined.`
        );
      }

      if (lease.leaseExpireTime !== undefined) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseExpireTime ${lease.leaseExpireTime} is undefined.`
        );
      }

      if (
        lease.leaseDurationSeconds === undefined ||
        lease.leaseDurationSeconds === -1
      ) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseDurationSeconds ${lease.leaseDurationSeconds} is undefined or -1 (infinite).`
        );
      }

      if (lease.leaseDurationType !== undefined) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseDurationType ${lease.leaseDurationType} is not undefined.`
        );
      }

      if (lease.leaseBreakTime !== undefined) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseBreakTime ${lease.leaseBreakTime} is not undefined.`
        );
      }

      // Deep copy
      super({ ...lease }, context);
    } else if (lease.leaseState === LeaseStateType.Leased) {
      /*
       * LeaseState: Leased
       * LeaseStatus: Locked
       * LeaseDurationType: Fixed
       * LeaseExpireTime: now >= timestamp
       * LeaseDurationSeconds: number (not -1)
       * LeaseBreakTime: undefined
       * LeaseId: uuid
       */
      if (lease.leaseStatus !== LeaseStatusType.Locked) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming lease status ${lease.leaseStatus} is not ${LeaseStatusType.Locked}.`
        );
      }

      if (lease.leaseId === undefined) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseId ${lease.leaseId} should not be undefined.`
        );
      }

      if (
        lease.leaseExpireTime === undefined ||
        context.startTime < lease.leaseExpireTime
      ) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseExpireTime ${lease.leaseExpireTime} is undefined, or larger than current time ${context.startTime}.`
        );
      }

      if (
        lease.leaseDurationSeconds === undefined ||
        lease.leaseDurationSeconds === -1
      ) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseDurationSeconds ${lease.leaseDurationSeconds} is undefined or -1 (infinite).`
        );
      }

      if (lease.leaseDurationType !== LeaseDurationType.Fixed) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseDurationType ${lease.leaseDurationType} is not ${LeaseDurationType.Fixed}.`
        );
      }

      if (lease.leaseBreakTime !== undefined) {
        throw RangeError(
          `LeaseExpiredState:constructor() error, incoming leaseBreakTime ${lease.leaseBreakTime} is not undefined.`
        );
      }

      super(
        {
          leaseId: lease.leaseId,
          leaseState: LeaseStateType.Expired,
          leaseStatus: LeaseStatusType.Unlocked,
          leaseDurationType: undefined,
          leaseDurationSeconds: lease.leaseDurationSeconds,
          leaseExpireTime: undefined,
          leaseBreakTime: undefined
        },
        context
      );
    } else {
      throw RangeError(
        `LeaseExpiredState:constructor() error, incoming lease state ${lease.leaseState} is neither ${LeaseStateType.Expired} or ${LeaseStateType.Leased}.`
      );
    }
  }

  public acquire(duration: number, proposedLeaseId: string = ""): ILeaseState {
    if ((duration < 15 || duration > 60) && duration !== -1) {
      throw StorageErrorFactory.getInvalidLeaseDuration(this.context.contextId);
    }

    // TODO: Validate proposedLeaseId follows GUID format

    if (duration === -1) {
      return new LeaseLeasedState(
        {
          leaseId: proposedLeaseId || uuid(),
          leaseState: LeaseStateType.Leased,
          leaseStatus: LeaseStatusType.Locked,
          leaseDurationType: LeaseDurationType.Infinite,
          leaseDurationSeconds: undefined,
          leaseExpireTime: undefined,
          leaseBreakTime: undefined
        },
        this.context
      );
    } else {
      return new LeaseLeasedState(
        {
          leaseId: proposedLeaseId || uuid(),
          leaseState: LeaseStateType.Leased,
          leaseStatus: LeaseStatusType.Locked,
          leaseDurationType: LeaseDurationType.Fixed,
          leaseDurationSeconds: duration,
          leaseExpireTime: new Date(
            this.context.startTime!.getTime() + duration * 1000
          ),
          leaseBreakTime: undefined
        },
        this.context
      );
    }
  }

  public break(breakPeriod?: number): ILeaseState {
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

  public renew(): ILeaseState {
    return new LeaseLeasedState(
      {
        leaseId: this.lease.leaseId,
        leaseState: LeaseStateType.Leased,
        leaseStatus: LeaseStatusType.Locked,
        leaseDurationType: LeaseDurationType.Fixed,
        leaseDurationSeconds: this.lease.leaseDurationSeconds,
        leaseExpireTime: new Date(
          this.context.startTime!.getTime() +
            this.lease.leaseDurationSeconds! * 1000
        ),
        leaseBreakTime: undefined
      },
      this.context
    );
  }

  public change(): ILeaseState {
    throw StorageErrorFactory.getLeaseNotPresentWithLeaseOperation(
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
