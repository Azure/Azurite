import {
  LeaseDurationType,
  LeaseStateType,
  LeaseStatusType
} from "../generated/artifacts/models";
import { BlobModel } from "./IBlobMetadataStore";
import { ILease } from "./ILeaseState";

export default class LokiBlobLeaseAdapter implements ILease {
  public leaseId?: string | undefined;
  public leaseState: LeaseStateType;
  public leaseStatus: LeaseStatusType;
  public leaseDurationType?: LeaseDurationType | undefined;
  public leaseDurationSeconds?: number | undefined;
  public leaseExpireTime?: Date | undefined;
  public leaseBreakTime?: Date | undefined;

  public constructor(private readonly blob: BlobModel) {
    if (blob.properties.leaseState === undefined) {
      throw RangeError(
        `LokiBlobLeaseAdapter:constructor() container leaseState cannot be undefined.`
      );
    }

    if (blob.properties.leaseStatus === undefined) {
      throw RangeError(
        `LokiBlobLeaseAdapter:constructor() container leaseStatus cannot be undefined.`
      );
    }

    this.leaseId = blob.leaseId;
    this.leaseState = blob.properties.leaseState;
    this.leaseStatus = blob.properties.leaseStatus;
    this.leaseDurationType = blob.properties.leaseDuration;
    this.leaseDurationSeconds = blob.leaseDurationSeconds;
    this.leaseExpireTime = blob.leaseExpireTime;
    this.leaseBreakTime = blob.leaseBreakTime;
  }

  public sync() {
    this.blob.leaseId = this.leaseId;
    this.blob.properties.leaseState = this.leaseState;
    this.blob.properties.leaseStatus = this.leaseStatus;
    this.blob.properties.leaseDuration = this.leaseDurationType;
    this.blob.leaseDurationSeconds = this.leaseDurationSeconds;
    this.blob.leaseExpireTime = this.leaseExpireTime;
    this.blob.leaseBreakTime = this.leaseBreakTime;
  }
}
