import { LeaseStateType, LeaseStatusType } from "../generated/artifacts/models";
import { BlobModel } from "../persistence/IBlobMetadataStore";
import { ILease, ILeaseSyncer } from "./ILeaseState";

/**
 * TODO: Update expire blob lease status to available on write blob operations.
 *
 * Need run the function on: PutBlob, SetBlobMetadata, SetBlobProperties,
 * DeleteBlob, PutBlock, PutBlockList, PutPage, AppendBlock, CopyBlob(dest)
 *
 * @export
 * @class BlobWriteLeaseSyncer
 * @implements {ILeaseSyncer<BlobModel>}
 */
export default class BlobWriteLeaseSyncer implements ILeaseSyncer<BlobModel> {
  public constructor(public readonly blob: BlobModel) {}

  public sync(lease: ILease): BlobModel {
    this.blob.leaseId = lease.leaseId;
    this.blob.leaseExpireTime = lease.leaseExpireTime;
    this.blob.leaseDurationSeconds = lease.leaseDurationSeconds;
    this.blob.leaseBreakTime = lease.leaseBreakTime;
    this.blob.properties.leaseDuration = lease.leaseDurationType;
    this.blob.properties.leaseState = lease.leaseState;
    this.blob.properties.leaseStatus = lease.leaseStatus;

    if (
      lease.leaseState === LeaseStateType.Expired ||
      lease.leaseState === LeaseStateType.Broken
    ) {
      this.blob.properties.leaseState = LeaseStateType.Available;
      this.blob.properties.leaseStatus = LeaseStatusType.Unlocked;
      this.blob.properties.leaseDuration = undefined;
      this.blob.leaseDurationSeconds = undefined;
      this.blob.leaseId = undefined;
      this.blob.leaseExpireTime = undefined;
      this.blob.leaseBreakTime = undefined;
    } else {
      this.blob.leaseId = lease.leaseId;
      this.blob.leaseExpireTime = lease.leaseExpireTime;
      this.blob.leaseDurationSeconds = lease.leaseDurationSeconds;
      this.blob.leaseBreakTime = lease.leaseBreakTime;
      this.blob.properties.leaseDuration = lease.leaseDurationType;
      this.blob.properties.leaseState = lease.leaseState;
      this.blob.properties.leaseStatus = lease.leaseStatus;
    }

    return this.blob;
  }
}
