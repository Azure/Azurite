import * as Models from "../generated/artifacts/models";

export interface ILease {
  leaseId?: string;
  leaseState: Models.LeaseStateType; // Available, Leased, Breaking, Broken, Expired
  leaseStatus: Models.LeaseStatusType; // Locked, Unlocked
  leaseDurationType?: Models.LeaseDurationType; // Fixed, Infinity, undefined
  leaseDurationSeconds?: number; // number, undefined, -1
  leaseExpireTime?: Date;
  leaseBreakTime?: Date;
}

export interface ILeaseState {
  lease: ILease;
  acquire(duration: number, proposedLeaseId?: string): ILeaseState;
  break(breakPeriod?: number): ILeaseState;
  renew(leaseId: string): ILeaseState;
  change(leaseId: string, proposedLeaseId: string): ILeaseState;
  release(leaseId: string): ILeaseState;
}
