import {
  LeaseDurationType,
  LeaseStateType,
  LeaseStatusType
} from "../generated/artifacts/models";
import { ContainerModel } from "./IBlobMetadataStore";
import { ILease } from "./ILeaseState";

export default class LokiContainerLeaseAdapter implements ILease {
  public leaseId?: string | undefined;
  public leaseState: LeaseStateType;
  public leaseStatus: LeaseStatusType;
  public leaseDurationType?: LeaseDurationType | undefined;
  public leaseDurationSeconds?: number | undefined;
  public leaseExpireTime?: Date | undefined;
  public leaseBreakTime?: Date | undefined;

  public constructor(private readonly container: ContainerModel) {
    if (container.properties.leaseState === undefined) {
      throw RangeError(
        `LokiContainerLeaseAdapter:constructor() container leaseState cannot be undefined.`
      );
    }

    if (container.properties.leaseStatus === undefined) {
      throw RangeError(
        `LokiContainerLeaseAdapter:constructor() container leaseStatus cannot be undefined.`
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

  public sync() {
    this.container.leaseId = this.leaseId;
    this.container.properties.leaseState = this.leaseState;
    this.container.properties.leaseStatus = this.leaseStatus;
    this.container.properties.leaseDuration = this.leaseDurationType;
    this.container.leaseDurationSeconds = this.leaseDurationSeconds;
    this.container.leaseExpireTime = this.leaseExpireTime;
    this.container.leaseBreakTime = this.leaseBreakTime;
  }
}
