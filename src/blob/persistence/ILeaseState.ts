import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";

export interface ILease {
  leaseId?: string;
  leaseState?: Models.LeaseStateType; // undefined, Available, Leased, Breaking, Broken, Expired
  leaseStatus?: Models.LeaseStatusType; // undefined, Locked, Unlocked
  leaseDurationType?: Models.LeaseDurationType; // Fixed, Infinity, undefined
  leaseDurationSeconds?: number; // number, undefined, -1
  leaseExpireTime?: Date;
  leaseBreakTime?: Date;
}

export interface ILeaseValidator {
  validate(lease: ILease, context: Context): void;
}

export interface ILeaseSyncer<T> {
  sync(lease: ILease): T;
}

export interface ILeaseState {
  lease: ILease;
  acquire(duration: number, proposedLeaseId?: string): ILeaseState;
  break(breakPeriod?: number): ILeaseState;
  renew(leaseId: string): ILeaseState;
  change(leaseId: string, proposedLeaseId: string): ILeaseState;
  release(leaseId: string): ILeaseState;
  validate(validator: ILeaseValidator): ILeaseState;
  sync<T>(syncer: ILeaseSyncer<T>): T;
}
