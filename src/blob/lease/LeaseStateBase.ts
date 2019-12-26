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
  public sync<T>(syncer: ILeaseSyncer<T>): T {
    return syncer.sync(this.lease);
  }
  public validate(validator: ILeaseValidator): ILeaseState {
    validator.validate(this.lease, this.context);
    return this;
  }
}
