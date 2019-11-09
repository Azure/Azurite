import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  LeaseAccessConditions,
  LeaseStatusType
} from "../generated/artifacts/models";
import Context from "../generated/Context";
import { ILease, ILeaseValidator } from "./ILeaseState";

export default class BlobWriteLeaseValidator implements ILeaseValidator {
  public constructor(
    public readonly leaseAccessConditions?: LeaseAccessConditions
  ) {}

  public validate(lease: ILease, context: Context) {
    // check Leased -> Expired
    if (lease.leaseStatus === LeaseStatusType.Locked) {
      if (
        this.leaseAccessConditions === undefined ||
        this.leaseAccessConditions.leaseId === undefined ||
        this.leaseAccessConditions.leaseId === ""
      ) {
        throw StorageErrorFactory.getBlobLeaseIdMissing(context.contextId);
      } else if (
        lease.leaseId !== undefined &&
        this.leaseAccessConditions.leaseId.toLowerCase() !==
          lease.leaseId.toLowerCase()
      ) {
        throw StorageErrorFactory.getBlobLeaseIdMismatchWithBlobOperation(
          context.contextId
        );
      }
    } else if (
      this.leaseAccessConditions !== undefined &&
      this.leaseAccessConditions.leaseId !== undefined &&
      this.leaseAccessConditions.leaseId !== ""
    ) {
      throw StorageErrorFactory.getBlobLeaseLost(context.contextId);
    }
  }
}
