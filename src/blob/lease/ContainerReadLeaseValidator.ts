import StorageErrorFactory from "../errors/StorageErrorFactory";
import {
  LeaseAccessConditions,
  LeaseStatusType
} from "../generated/artifacts/models";
import Context from "../generated/Context";
import { ILease, ILeaseValidator } from "./ILeaseState";

export default class ContainerReadLeaseValidator implements ILeaseValidator {
  public constructor(
    public readonly leaseAccessConditions?: LeaseAccessConditions
  ) {}

  public validate(lease: ILease, context: Context) {
    // check only when input Leased Id is not empty
    if (
      this.leaseAccessConditions !== undefined &&
      this.leaseAccessConditions.leaseId !== undefined &&
      this.leaseAccessConditions.leaseId !== ""
    ) {
      // return error when lease is unlocked
      if (lease.leaseStatus === LeaseStatusType.Unlocked) {
        throw StorageErrorFactory.getContainerLeaseLost(context.contextId);
      } else if (
        lease.leaseId !== undefined &&
        this.leaseAccessConditions.leaseId.toLowerCase() !==
          lease.leaseId.toLowerCase()
      ) {
        // return error when lease is locked but lease ID not match
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithContainerOperation(
          context.contextId
        );
      }
    }
  }
}
