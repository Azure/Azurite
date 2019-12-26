import {
  LeaseDurationType,
  LeaseStateType,
  LeaseStatusType
} from "../generated/artifacts/models";
import { ContainerModel } from "../persistence/IBlobMetadataStore";
import { ILease } from "./ILeaseState";

export default class ContainerLeaseAdapter implements ILease {
  public leaseId?: string | undefined;
  public leaseState: LeaseStateType;
  public leaseStatus: LeaseStatusType;
  public leaseDurationType?: LeaseDurationType | undefined;
  public leaseDurationSeconds?: number | undefined;
  public leaseExpireTime?: Date | undefined;
  public leaseBreakTime?: Date | undefined;

  public constructor(container: ContainerModel) {
    if (container.properties.leaseState === undefined) {
      throw RangeError(
        `ContainerLeaseAdapter:constructor() container leaseState cannot be undefined.`
      );
    }

    if (container.properties.leaseStatus === undefined) {
      throw RangeError(
        `ContainerLeaseAdapter:constructor() container leaseStatus cannot be undefined.`
      );
    }

    this.leaseId = container.leaseId;
    this.leaseState = container.properties.leaseState;
    this.leaseStatus = container.properties.leaseStatus;
    this.leaseDurationType = container.properties.leaseDuration;
    this.leaseDurationSeconds = container.leaseDurationSeconds;
    this.leaseExpireTime = container.leaseExpireTime;
    this.leaseBreakTime = container.leaseBreakTime;
  }

  public toString(): string {
    return JSON.stringify({
      leaseId: this.leaseId,
      leaseState: this.leaseState,
      leaseStatus: this.leaseStatus,
      leaseDurationType: this.leaseDurationType,
      leaseDurationSeconds: this.leaseDurationSeconds,
      leaseExpireTime: this.leaseExpireTime,
      leaseBreakTime: this.leaseBreakTime
    });
  }
}
