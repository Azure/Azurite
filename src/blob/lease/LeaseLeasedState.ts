import uuid = require("uuid");

import { minDate } from "../../common/utils/utils";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  LeaseDurationType,
  LeaseStateType,
  LeaseStatusType
} from "../generated/artifacts/models";
import Context from "../generated/Context";
import { ILease, ILeaseState } from "./ILeaseState";
import LeaseAvailableState from "./LeaseAvailableState";
import LeaseBreakingState from "./LeaseBreakingState";
import LeaseBrokenState from "./LeaseBrokenState";
import LeaseStateBase from "./LeaseStateBase";

export default class LeaseLeasedState extends LeaseStateBase {
  public constructor(lease: ILease, context: Context) {
    /*
     * LeaseState: Leased
     * LeaseStatus: Locked
     * LeaseDurationType: Fixed || Infinite
     * LeaseExpireTime: now < timestamp || undefined
     * LeaseDurationSeconds: number || -1
     * LeaseBreakTime: undefined
     * LeaseId: uuid
     */
    if (context.startTime === undefined) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, context.startTime is undefined.`
      );
    }

    if (lease.leaseState !== LeaseStateType.Leased) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming lease state ${lease.leaseState} is not ${LeaseStateType.Leased}.`
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

    if (
      lease.leaseExpireTime !== undefined &&
      context.startTime >= lease.leaseExpireTime
    ) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming leaseExpireTime ${lease.leaseExpireTime} is not undefined, and smaller than current time ${context.startTime}.`
      );
    }

    // leaseDurationSeconds could be number or undefined
    // if (
    //   lease.leaseDurationSeconds !== undefined &&
    //   lease.leaseDurationSeconds !== -1
    // ) {
    //   throw RangeError(
    // tslint:disable-next-line:max-line-length
    //     `LeaseLeasedState:constructor() error, incoming leaseDurationSeconds ${lease.leaseDurationSeconds} is not undefined, and not equal to -1.`
    //   );
    // }

    if (lease.leaseDurationType === undefined) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming leaseDurationType ${lease.leaseDurationType} is undefined.`
      );
    }

    if (lease.leaseBreakTime !== undefined) {
      throw RangeError(
        `LeaseLeasedState:constructor() error, incoming leaseBreakTime ${lease.leaseBreakTime} is not undefined.`
      );
    }

    // Deep copy
    super({ ...lease }, context);
  }

  public acquire(duration: number, proposedLeaseId: string = ""): ILeaseState {
    if (proposedLeaseId !== this.lease.leaseId) {
      // TODO: Check error message
      throw StorageErrorFactory.getLeaseAlreadyPresent(this.context.contextId);
    }

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
    if (this.lease.leaseDurationType === LeaseDurationType.Infinite) {
      if (breakPeriod === 0 || breakPeriod === undefined) {
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
      } else {
        return new LeaseBreakingState(
          {
            leaseId: this.lease.leaseId,
            leaseState: LeaseStateType.Breaking,
            leaseStatus: LeaseStatusType.Locked,
            leaseDurationType: undefined,
            leaseDurationSeconds: undefined,
            leaseExpireTime: undefined,
            leaseBreakTime: new Date(
              this.context.startTime!.getTime() + breakPeriod * 1000
            )
          },
          this.context
        );
      }
    }

    // Following only cares about this.lease.leaseDurationType === LeaseDurationType.Fixed

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

    if (breakPeriod === undefined) {
      return new LeaseBreakingState(
        {
          leaseId: this.lease.leaseId,
          leaseState: LeaseStateType.Breaking,
          leaseStatus: LeaseStatusType.Locked,
          leaseDurationType: undefined,
          leaseDurationSeconds: undefined,
          leaseExpireTime: undefined,
          leaseBreakTime: this.lease.leaseExpireTime
        },
        this.context
      );
    }

    if (breakPeriod < 0 || breakPeriod > 60) {
      throw StorageErrorFactory.getInvalidLeaseBreakPeriod(
        this.context.contextId
      );
    }

    // Following only cares about breakPeriod between (0, 60]

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
        leaseBreakTime: minDate(this.lease.leaseExpireTime!, breakTime)
      },
      this.context
    );
  }

  public renew(leaseId: string): ILeaseState {
    if (this.lease.leaseId !== leaseId) {
      throw StorageErrorFactory.getLeaseIdMismatchWithLeaseOperation(
        this.context.contextId
      );
    }

    if (this.lease.leaseDurationType === LeaseDurationType.Infinite) {
      return this;
    }

    // Renew a fixed lease
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

  public change(leaseId: string, proposedLeaseId: string): ILeaseState {
    if (
      this.lease.leaseId !== leaseId &&
      this.lease.leaseId !== proposedLeaseId
    ) {
      throw StorageErrorFactory.getLeaseIdMismatchWithLeaseOperation(
        this.context.contextId
      );
    }

    return new LeaseLeasedState(
      {
        leaseId: proposedLeaseId,
        leaseState: LeaseStateType.Leased,
        leaseStatus: LeaseStatusType.Locked,
        leaseDurationType: this.lease.leaseDurationType,
        leaseDurationSeconds: this.lease.leaseDurationSeconds,
        leaseExpireTime: this.lease.leaseExpireTime,
        leaseBreakTime: undefined
      },
      this.context
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
