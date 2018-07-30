import BbPromise from "bluebird";
import * as fsExtra from "fs-extra";
import InternalAzuriteError from "./../../core/InternalAzuriteError";

const fs = BbPromise.promisifyAll(fsExtra);

/**
 * DO NOT INSTANTIATE.
 * Serves as the base class proxy to the corresponding LokiJS object, which could be either a container or a blob.
 *
 * @class StorageEntityProxy
 */
class StorageEntityProxy {
  public original: any;
  constructor(original) {
    if (!original) {
      throw new InternalAzuriteError("StorageEntityProxy: missing original");
    }
    this.original = original;
  }

  public release() {
    this.updateLeaseState();
    this.updateETag();
    return this.original;
  }

  /**
   * Updates and returns the lease state of the storage item based on its internal state.
   * Changes to the underlying LokiJS object are automatically persisted by LokiJS.
   *
   * @returns
   * @memberof StorageEntityProxy
   */
  public updateLeaseState() {
    const now = Date.now();
    switch (this.original.leaseState) {
      // Has breaking period expired?
      case "breaking":
        this.original.leaseState =
          this.original.leaseBrokenAt <= now ? "broken" : "breaking";
        break;
      // Has lease expired?
      case "leased":
        // Infinite Lease
        this.original.leaseState =
          this.original.leaseExpiredAt === -1
            ? "leased"
            : this.original.leaseExpiredAt <= now
              ? "expired"
              : "leased";
        break;
      default:
        this.original.leaseState = this.original.leaseState || "available";
    }
    return this.original.leaseState;
  }

  public updateETag() {
    throw new InternalAzuriteError("updateETag not implemented!");
  }

  /**
   * Returns the date and time the storage entity was last modified. The date format follows RFC 1123.
   *
   * @returns
   * @memberof StorageEntityProxy
   */
  public lastModified() {
    return new Date(
      this.original.meta.updated || this.original.meta.created
    ).toUTCString();
  }
}

export default StorageEntityProxy;
