import { ContainerModel } from "../persistence/IBlobMetadataStore";
import { ILease, ILeaseSyncer } from "./ILeaseState";

export default class ContainerLeaseSyncer
  implements ILeaseSyncer<ContainerModel> {
  public constructor(public readonly container: ContainerModel) {}

  public sync(lease: ILease): ContainerModel {
    this.container.leaseId = lease.leaseId;
    this.container.leaseExpireTime = lease.leaseExpireTime;
    this.container.leaseDurationSeconds = lease.leaseDurationSeconds;
    this.container.leaseBreakTime = lease.leaseBreakTime;
    this.container.properties.leaseDuration = lease.leaseDurationType;
    this.container.properties.leaseState = lease.leaseState;
    this.container.properties.leaseStatus = lease.leaseStatus;
    return this.container;
  }
}
