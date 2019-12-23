import { BlobModel } from "../persistence/IBlobMetadataStore";
import { ILease, ILeaseSyncer } from "./ILeaseState";

export default class BlobLeaseSyncer implements ILeaseSyncer<BlobModel> {
  public constructor(public readonly blob: BlobModel) {}

  public sync(lease: ILease): BlobModel {
    this.blob.leaseId = lease.leaseId;
    this.blob.leaseExpireTime = lease.leaseExpireTime;
    this.blob.leaseDurationSeconds = lease.leaseDurationSeconds;
    this.blob.leaseBreakTime = lease.leaseBreakTime;
    this.blob.properties.leaseDuration = lease.leaseDurationType;
    this.blob.properties.leaseState = lease.leaseState;
    this.blob.properties.leaseStatus = lease.leaseStatus;
    return this.blob;
  }
}
