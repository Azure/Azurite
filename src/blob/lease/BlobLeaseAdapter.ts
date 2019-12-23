import {
  LeaseDurationType,
  LeaseStateType,
  LeaseStatusType
} from "../generated/artifacts/models";
import { BlobModel } from "../persistence/IBlobMetadataStore";
import { ILease } from "./ILeaseState";

export default class BlobLeaseAdapter implements ILease {
  public leaseId?: string | undefined;
  public leaseState: LeaseStateType;
  public leaseStatus: LeaseStatusType;
  public leaseDurationType?: LeaseDurationType | undefined;
  public leaseDurationSeconds?: number | undefined;
  public leaseExpireTime?: Date | undefined;
  public leaseBreakTime?: Date | undefined;

  public constructor(blob: BlobModel) {
    if (blob.properties.leaseState === undefined) {
      blob.properties.leaseState = LeaseStateType.Available;
      // throw RangeError(
      //   `BlobLeaseAdapter:constructor() blob leaseState cannot be undefined.`
      // );
    }

    if (blob.properties.leaseStatus === undefined) {
      blob.properties.leaseStatus = LeaseStatusType.Unlocked;
      // throw RangeError(
      //   `BlobLeaseAdapter:constructor() blob leaseStatus cannot be undefined.`
      // );
    }

    this.leaseId = blob.leaseId;
    this.leaseState = blob.properties.leaseState;
    this.leaseStatus = blob.properties.leaseStatus;
    this.leaseDurationType = blob.properties.leaseDuration;
    this.leaseDurationSeconds = blob.leaseDurationSeconds;
    this.leaseExpireTime = blob.leaseExpireTime;
    this.leaseBreakTime = blob.leaseBreakTime;
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
