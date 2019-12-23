import uuid = require("uuid");

import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  LeaseDurationType,
  LeaseStateType,
  LeaseStatusType
} from "../generated/artifacts/models";
import Context from "../generated/Context";
import { ILease, ILeaseState } from "./ILeaseState";
import LeaseLeasedState from "./LeaseLeasedState";
import LeaseStateBase from "./LeaseStateBase";

/**
 * Available lease state.
 *
 * @export
 * @class LeaseAvailableState
 */
export default class LeaseAvailableState extends LeaseStateBase {
  public constructor(lease: ILease, context: Context) {
    /*
     * LeaseState: Available
     * LeaseStatus: Unlocked
     * LeaseDurationType: undefined
     * LeaseExpireTime: undefined
     * LeaseDurationSeconds: undefined
     * LeaseBreakTime: undefined
     * LeaseId: undefined
     */
    if (context.startTime === undefined) {
      throw RangeError(
        `LeaseAvailableState:constructor() error, context.startTime is undefined.`
      );
    }

    if (lease.leaseState === undefined) {
      super(
        {
          leaseId: undefined,
          leaseState: undefined,
          leaseStatus: undefined,
          leaseDurationType: undefined,
          leaseDurationSeconds: undefined,
          leaseExpireTime: undefined,
          leaseBreakTime: undefined
        },
        context
      );
      return;
    }

    if (lease.leaseState !== LeaseStateType.Available) {
      throw RangeError(
        `LeaseAvailableState:constructor() error, incoming lease state ${lease.leaseState} is not ${LeaseStateType.Available}.`
      );
    }

    if (lease.leaseStatus !== LeaseStatusType.Unlocked) {
      throw RangeError(
        `LeaseAvailableState:constructor() error, incoming lease status ${lease.leaseStatus} is not ${LeaseStatusType.Unlocked}.`
      );
    }

    if (lease.leaseId !== undefined) {
      throw RangeError(
        `LeaseAvailableState:constructor() error, incoming leaseId ${lease.leaseId} is not undefined.`
      );
    }

    if (lease.leaseExpireTime !== undefined) {
      throw RangeError(
        `LeaseAvailableState:constructor() error, incoming leaseExpireTime ${lease.leaseExpireTime} is not undefined.`
      );
    }

    if (lease.leaseDurationSeconds !== undefined) {
      throw RangeError(
        `LeaseAvailableState:constructor() error, incoming leaseDurationSeconds ${lease.leaseDurationSeconds} is not undefined.`
      );
    }

    if (lease.leaseDurationType !== undefined) {
      throw RangeError(
        `LeaseAvailableState:constructor() error, incoming leaseDurationType ${lease.leaseDurationType} is not undefined.`
      );
    }

    if (lease.leaseBreakTime !== undefined) {
      throw RangeError(
        `LeaseAvailableState:constructor() error, incoming leaseBreakTime ${lease.leaseBreakTime} is not undefined.`
      );
    }

    // Deep copy
    super({ ...lease }, context);
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

  public break(): ILeaseState {
    throw StorageErrorFactory.getLeaseNotPresentWithLeaseOperation(
      this.context.contextId
    );
  }

  public renew(leaseId: string): ILeaseState {
    throw StorageErrorFactory.getLeaseIdMismatchWithLeaseOperation(
      this.context.contextId
    );
  }

  public change(): ILeaseState {
    throw StorageErrorFactory.getLeaseNotPresentWithLeaseOperation(
      this.context.contextId
    );
  }

  public release(leaseId: string): ILeaseState {
    throw StorageErrorFactory.getLeaseIdMismatchWithLeaseOperation(
      this.context.contextId
    );
  }
}
