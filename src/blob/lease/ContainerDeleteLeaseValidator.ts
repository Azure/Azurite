import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  LeaseAccessConditions,
  LeaseStatusType
} from "../generated/artifacts/models";
import Context from "../generated/Context";
import { ILease, ILeaseValidator } from "./ILeaseState";

export default class ContainerDeleteLeaseValidator implements ILeaseValidator {
  public constructor(
    public readonly leaseAccessConditions?: LeaseAccessConditions
  ) {}

  public validate(lease: ILease, context: Context) {
    // Check Lease status
    if (lease.leaseStatus === LeaseStatusType.Locked) {
      if (
        this.leaseAccessConditions === undefined ||
        this.leaseAccessConditions.leaseId === undefined ||
        this.leaseAccessConditions.leaseId === null
      ) {
        throw StorageErrorFactory.getContainerLeaseIdMissing(context.contextId);
      } else if (
        lease.leaseId !== undefined &&
        this.leaseAccessConditions.leaseId.toLowerCase() !==
          lease.leaseId.toLowerCase()
      ) {
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithContainerOperation(
          context.contextId
        );
      }
    } else if (
      this.leaseAccessConditions !== undefined &&
      this.leaseAccessConditions.leaseId !== undefined &&
      this.leaseAccessConditions.leaseId !== null &&
      this.leaseAccessConditions.leaseId !== ""
    ) {
      throw StorageErrorFactory.getContainerLeaseLost(context.contextId);
    }
  }
}
