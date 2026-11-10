import StorageErrorFactory from "../errors/StorageErrorFactory";
import Context from "../generated/Context";
import {
  ILease,
  ILeaseState,
  ILeaseSyncer,
  ILeaseValidator
} from "./ILeaseState";

export default abstract class LeaseStateBase implements ILeaseState {
  public constructor(
    public readonly lease: ILease,
    protected readonly context: Context
  ) {}
  public abstract acquire(
    duration: number,
    proposedLeaseId?: string | undefined
  ): ILeaseState;
  public abstract break(breakPeriod?: number | undefined): ILeaseState;
  public abstract renew(leaseId: string): ILeaseState;
  public abstract change(leaseId: string, proposedLeaseId: string): ILeaseState;
  public abstract release(leaseId: string): ILeaseState;
  /**
   * Azure accepts a fixed lease duration between 15 and 60 seconds, or -1 for
   * an infinite lease. A missing x-ms-lease-duration parses as undefined and
   * used to slip through the comparison below, persisting a lease whose expiry
   * time was invalid and making every later request fail.
   */
  protected validateLeaseDuration(duration: number): void {
    if (
      !Number.isInteger(duration) ||
      ((duration < 15 || duration > 60) && duration !== -1)
    ) {
      throw StorageErrorFactory.getInvalidLeaseDuration(this.context.contextId);
    }
  }

  public sync<T>(syncer: ILeaseSyncer<T>): T {
    return syncer.sync(this.lease);
  }
  public validate(validator: ILeaseValidator): ILeaseState {
    validator.validate(this.lease, this.context);
    return this;
  }
}
