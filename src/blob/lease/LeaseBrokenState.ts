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
import LeaseLeasedState from "./LeaseLeasedState";
import LeaseStateBase from "./LeaseStateBase";

export default class LeaseBrokenState extends LeaseStateBase {
  public constructor(lease: ILease, context: Context) {
    if (context.startTime === undefined) {
      throw RangeError(
        `LeaseBrokenState:constructor() error, context.startTime is undefined.`
      );
    }

    if (lease.leaseState === LeaseStateType.Broken) {
      /*
       * LeaseState: Broken
       * LeaseStatus: Unlocked
       * LeaseDurationType: undefined
       * LeaseExpireTime: undefined
       * LeaseDurationSeconds: undefined
       * LeaseBreakTime: undefined
       * LeaseId: uuid
       */
      if (lease.leaseStatus !== LeaseStatusType.Unlocked) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming lease status ${lease.leaseStatus} is not ${LeaseStatusType.Unlocked}.`
        );
      }

      if (lease.leaseId === undefined) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseId ${lease.leaseId} should not be undefined.`
        );
      }

      if (lease.leaseExpireTime !== undefined) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseExpireTime ${lease.leaseExpireTime} is not undefined.`
        );
      }

      if (lease.leaseDurationSeconds !== undefined) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseDurationSeconds ${lease.leaseDurationSeconds} is not undefined.`
        );
      }

      if (lease.leaseDurationType !== undefined) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseDurationType ${lease.leaseDurationType} is not undefined.`
        );
      }

      if (lease.leaseBreakTime !== undefined) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseBreakTime ${lease.leaseBreakTime} is not undefined.`
        );
      }

      // Deep copy
      super({ ...lease }, context);
    } else if (lease.leaseState === LeaseStateType.Breaking) {
      /*
       * LeaseState: Breaking
       * LeaseStatus: Locked
       * LeaseDurationType: undefined
       * LeaseExpireTime: undefined
       * LeaseDurationSeconds: undefined
       * LeaseBreakTime: now >= timestamp
       * LeaseId: uuid
       */
      if (lease.leaseStatus !== LeaseStatusType.Locked) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming lease status ${lease.leaseStatus} is not ${LeaseStatusType.Locked}.`
        );
      }

      if (lease.leaseId === undefined) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseId ${lease.leaseId} should not be undefined.`
        );
      }

      if (lease.leaseExpireTime !== undefined) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseExpireTime ${lease.leaseExpireTime} is not undefined.`
        );
      }

      if (lease.leaseDurationSeconds !== undefined) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseDurationSeconds ${lease.leaseDurationSeconds} is not undefined.`
        );
      }

      if (lease.leaseDurationType !== undefined) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseDurationType ${lease.leaseDurationType} is not undefined.`
        );
      }

      if (
        lease.leaseBreakTime === undefined ||
        context.startTime < lease.leaseBreakTime
      ) {
        throw RangeError(
          `LeaseBrokenState:constructor() error, incoming leaseBreakTime ${lease.leaseBreakTime} is undefined, or larger than current time ${context.startTime}.`
        );
      }

      super(
        {
          leaseId: lease.leaseId,
          leaseState: LeaseStateType.Broken,
          leaseStatus: LeaseStatusType.Unlocked,
          leaseDurationType: undefined,
          leaseDurationSeconds: undefined,
          leaseExpireTime: undefined,
          leaseBreakTime: undefined
        },
        context
      );
    } else {
      throw RangeError(
        `LeaseBrokenState:constructor() error, incoming lease state ${lease.leaseState} is neither ${LeaseStateType.Broken} or ${LeaseStateType.Breaking}.`
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
    return this;
  }

  public renew(proposedLeaseId: string): ILeaseState {
    if (proposedLeaseId === this.lease.leaseId) {
      throw StorageErrorFactory.getLeaseIsBrokenAndCannotBeRenewed(
        this.context.contextId
      );
    } else {
      throw StorageErrorFactory.getLeaseIdMismatchWithLeaseOperation(
        this.context.contextId
      );
    }
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
