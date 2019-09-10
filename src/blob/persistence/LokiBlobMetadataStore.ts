import { stat } from "fs";
import Loki from "lokijs";
import uuid from "uuid/v4";

import IGCExtentProvider from "../../common/IGCExtentProvider";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import BlobHandler from "../handlers/BlobHandler";
import PageBlobRangesManager from "../handlers/PageBlobRangesManager";
import { newEtag } from "../utils/utils";
import IBlobMetadataStore, {
  AcquireBlobLeaseRes,
  AcquireContainerLeaseRes,
  BlobId,
  BlobModel,
  BlockModel,
  BreakBlobLeaseRes,
  BreakContainerLeaseRes,
  ChangeBlobLeaseRes,
  ChangeContainerLeaseRes,
  ContainerModel,
  CreateSnapshotRes,
  GetBlobPropertiesRes,
  GetContainerAccessPolicyRes,
  GetContainerPropertiesRes,
  GetPageRangeRes,
  IContainerMetadata,
  IPersistencyChunk,
  PersistencyBlockModel,
  ReleaseBlobLeaseRes,
  ReleaseContainerLeaseRes,
  RenewBlobLeaseRes,
  RenewContainerLeaseRes,
  ServicePropertiesModel,
  SetContainerAccessPolicyParam
} from "./IBlobMetadataStore";

/**
 * This is a metadata source implementation for blob based on loki DB.
 *
 * Notice that, following design is for emulator purpose only, and doesn't design for best performance.
 * We may want to optimize the persistency layer performance in the future. Such as by distributing metadata
 * into different collections, or make binary payload write as an append-only pattern.
 *
 * Loki DB includes following collections and documents:
 *
 * -- SERVICE_PROPERTIES_COLLECTION // Collection contains service properties
 *                                  // Default collection name is $SERVICES_COLLECTION$
 *                                  // Each document maps to 1 account blob service
 *                                  // Unique document properties: accountName
 * -- CONTAINERS_COLLECTION  // Collection contains all containers
 *                           // Default collection name is $CONTAINERS_COLLECTION$
 *                           // Each document maps to 1 container
 *                           // Unique document properties: accountName, (container)name
 * -- BLOBS_COLLECTION       // Collection contains all blobs
 *                           // Default collection name is $BLOBS_COLLECTION$
 *                           // Each document maps to a blob
 *                           // Unique document properties: accountName, containerName, (blob)name, snapshot
 * -- BLOCKS_COLLECTION      // Block blob blocks collection includes all UNCOMMITTED blocks
 *                           // Unique document properties: accountName, containerName, blobName, name, isCommitted
 *
 * @export
 * @class LokiBlobMetadataStore
 */
export default class LokiBlobMetadataStore
  implements IBlobMetadataStore, IGCExtentProvider {
  private readonly db: Loki;

  private initialized: boolean = false;
  private closed: boolean = false;

  private readonly SERVICES_COLLECTION = "$SERVICES_COLLECTION$";
  private readonly CONTAINERS_COLLECTION = "$CONTAINERS_COLLECTION$";
  private readonly BLOBS_COLLECTION = "$BLOBS_COLLECTION$";
  private readonly BLOCKS_COLLECTION = "$BLOCKS_COLLECTION$";

  private readonly pageBlobRangesManager = new PageBlobRangesManager();

  public constructor(public readonly lokiDBPath: string) {
    this.db = new Loki(lokiDBPath, {
      autosave: true,
      autosaveInterval: 5000
    });
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public isClosed(): boolean {
    return this.closed;
  }

  public async init(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      stat(this.lokiDBPath, (statError, stats) => {
        if (!statError) {
          this.db.loadDatabase({}, dbError => {
            if (dbError) {
              reject(dbError);
            } else {
              resolve();
            }
          });
        } else {
          // when DB file doesn't exist, ignore the error because following will re-create the file
          resolve();
        }
      });
    });

    // In loki DB implementation, these operations are all sync. Doesn't need an async lock

    // Create service properties collection if not exists
    let servicePropertiesColl = this.db.getCollection(this.SERVICES_COLLECTION);
    if (servicePropertiesColl === null) {
      servicePropertiesColl = this.db.addCollection(this.SERVICES_COLLECTION, {
        unique: ["accountName"]
      });
    }

    // Create containers collection if not exists
    if (this.db.getCollection(this.CONTAINERS_COLLECTION) === null) {
      this.db.addCollection(this.CONTAINERS_COLLECTION, {
        // Optimization for indexing and searching
        // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
        indices: ["accountName", "name"]
      }); // Optimize for find operation
    }

    // Create containers collection if not exists
    if (this.db.getCollection(this.BLOBS_COLLECTION) === null) {
      this.db.addCollection(this.BLOBS_COLLECTION, {
        indices: ["accountName", "containerName", "name", "snapshot"] // Optimize for find operation
      });
    }

    // Create blocks collection if not exists
    if (this.db.getCollection(this.BLOCKS_COLLECTION) === null) {
      this.db.addCollection(this.BLOCKS_COLLECTION, {
        indices: ["accountName", "containerName", "blobName", "name"] // Optimize for find operation
      });
    }

    await new Promise((resolve, reject) => {
      this.db.saveDatabase(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.initialized = true;
    this.closed = false;
  }

  /**
   * Close loki DB.
   *
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.closed = true;
  }

  // TODO
  public iteratorAllExtents(): AsyncIterator<string[]> {
    throw new Error("Method not implemented.");
  }

  /**
   * Update blob service properties. Create service properties if not exists in persistency layer.
   *
   * TODO: Account's service property should be created when storage account is created or metadata
   * storage initialization. This method should only be responsible for updating existing record.
   * In this way, we can reduce one I/O call to get account properties.
   *
   * @param {ServicePropertiesModel} serviceProperties
   * @returns {Promise<ServicePropertiesModel>} undefined properties will be ignored during properties setup
   * @memberof LokiBlobMetadataStore
   */
  public async setServiceProperties(
    serviceProperties: ServicePropertiesModel
  ): Promise<ServicePropertiesModel> {
    const coll = this.db.getCollection(this.SERVICES_COLLECTION);
    const doc = coll.by("accountName", serviceProperties.accountName);

    if (doc) {
      doc.cors =
        serviceProperties.cors === undefined
          ? doc.cors
          : serviceProperties.cors;

      doc.hourMetrics =
        serviceProperties.hourMetrics === undefined
          ? doc.hourMetrics
          : serviceProperties.hourMetrics;

      doc.logging =
        serviceProperties.logging === undefined
          ? doc.logging
          : serviceProperties.logging;

      doc.minuteMetrics =
        serviceProperties.minuteMetrics === undefined
          ? doc.minuteMetrics
          : serviceProperties.minuteMetrics;

      doc.defaultServiceVersion =
        serviceProperties.defaultServiceVersion === undefined
          ? doc.defaultServiceVersion
          : serviceProperties.defaultServiceVersion;

      doc.deleteRetentionPolicy =
        serviceProperties.deleteRetentionPolicy === undefined
          ? doc.deleteRetentionPolicy
          : serviceProperties.deleteRetentionPolicy;

      doc.staticWebsite =
        serviceProperties.staticWebsite === undefined
          ? doc.staticWebsite
          : serviceProperties.staticWebsite;

      return coll.update(doc);
    } else {
      return coll.insert(serviceProperties);
    }
  }

  /**
   * Get service properties for specific storage account.
   *
   * @param {string} account
   * @returns {Promise<ServicePropertiesModel | undefined>}
   * @memberof LokiBlobMetadataStore
   */
  public async getServiceProperties(
    account: string
  ): Promise<ServicePropertiesModel | undefined> {
    const coll = this.db.getCollection(this.SERVICES_COLLECTION);
    const doc = coll.by("accountName", account);
    return doc ? doc : undefined;
  }

  /**
   * List containers with query conditions specified.
   *
   * @param {string} account
   * @param {string} [prefix=""]
   * @param {number} [maxResults=2000]
   * @param {number} [marker=0]
   * @returns {(Promise<[ContainerModel[], number | undefined]>)}
   * @memberof LokiBlobMetadataStore
   */
  public async listContainers(
    account: string,
    prefix: string = "",
    maxResults: number = 2000,
    marker: number = 0
  ): Promise<[ContainerModel[], number | undefined]> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);

    const query =
      prefix === ""
        ? { $loki: { $gt: marker }, accountName: account }
        : {
            name: { $regex: `^${this.escapeRegex(prefix)}` },
            $loki: { $gt: marker },
            accountName: account
          };

    const docs = coll
      .chain()
      .find(query)
      .limit(maxResults + 1)
      .data();

    if (docs.length <= maxResults) {
      return [docs, undefined];
    } else {
      // In this case, the last item is the one we get in addition, should set the Marker before it.
      const nextMarker = docs[docs.length - 1].$loki - 1;
      docs.pop();
      return [docs, nextMarker];
    }
  }

  /**
   * Create a container.
   *
   * @param {ContainerModel} container
   * @returns {Promise<ContainerModel>}
   * @memberof LokiBlobMetadataStore
   */
  public async createContainer(
    container: ContainerModel,
    context?: Context
  ): Promise<ContainerModel> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({
      accountName: container.accountName,
      name: container.name
    });

    if (doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getContainerAlreadyExists(requestId);
    }

    return coll.insert(container);
  }

  /**
   * Get a container.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} [context]
   * @returns {Promise<ContainerModel>}
   * @memberof LokiBlobMetadataStore
   */
  public async getContainer(
    account: string,
    container: string,
    context?: Context
  ): Promise<ContainerModel> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: container });
    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getContainerNotFound(requestId);
    }
    return doc;
  }

  /**
   * Get a container properties.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} [context]
   * @returns {Promise<GetContainerPropertiesRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async getContainerProperties(
    account: string,
    container: string,
    context?: Context
  ): Promise<GetContainerPropertiesRes> {
    const doc = await this.getContainerDoc(account, container, context);

    const res: GetContainerPropertiesRes = {
      name: container,
      properties: doc.properties,
      metadata: doc.metadata
    };

    return res;
  }

  /**
   * Delete container item if exists from persistency layer.
   * Note that this method will mark the specific container with "deleting" tag. Container item
   * will be removed only if all blobs under that container has been removed with GC. During
   * "deleting" status, container and blobs under that container cannot be accessed.
   *
   * TODO: Make sure all metadata interface implementation follow up above assumption.
   * TODO: GC for async container deletion.
   *
   * @param {string} account
   * @param {string} container
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async deleteContainer(
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    context?: Context
  ): Promise<void> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerDoc(account, container, context);
    const requestId = context ? context.contextID : undefined;

    // Check Lease status
    if (doc.properties.leaseStatus === Models.LeaseStatusType.Locked) {
      if (
        leaseAccessConditions === undefined ||
        leaseAccessConditions.leaseId === undefined ||
        leaseAccessConditions.leaseId === null
      ) {
        throw StorageErrorFactory.getContainerLeaseIdMissing(requestId);
      } else if (
        doc.leaseId !== undefined &&
        leaseAccessConditions.leaseId.toLowerCase() !==
          doc.leaseId.toLowerCase()
      ) {
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithContainerOperation(
          requestId
        );
      }
    } else if (
      leaseAccessConditions !== undefined &&
      leaseAccessConditions.leaseId !== undefined &&
      leaseAccessConditions.leaseId !== null &&
      leaseAccessConditions.leaseId !== ""
    ) {
      throw StorageErrorFactory.getBlobLeaseLost(requestId);
    }

    coll.remove(doc);

    const blobColl = this.db.getCollection(this.BLOBS_COLLECTION);
    blobColl.findAndRemove({
      accountName: account,
      containerName: container
    });
  }

  /**
   * Set container metadata.
   *
   * @param {string} account
   * @param {string} container
   * @param {Date} lastModified
   * @param {string} etag
   * @param {IContainerMetadata} [metadata]
   * @param {Context} [context]
   * @returns {Promise<ContainerModel>}
   * @memberof LokiBlobMetadataStore
   */
  public async setContainerMetadata(
    account: string,
    container: string,
    lastModified: Date,
    etag: string,
    metadata?: IContainerMetadata,
    context?: Context
  ): Promise<ContainerModel> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerDoc(account, container, context);

    doc.properties.lastModified = lastModified;
    doc.properties.etag = etag;
    doc.metadata = metadata;

    return coll.update(doc);
  }

  /**
   * Get container access policy.
   *
   * @param {string} account
   * @param {string} container
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @param {Context} [context]
   * @returns {Promise<GetContainerAccessPolicyRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async getContainerACL(
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    context?: Context
  ): Promise<GetContainerAccessPolicyRes> {
    const doc = await this.getContainerDoc(account, container, context);
    const requestId = context ? context.contextID : undefined;

    this.checkLeaseOnReadContainer(doc, leaseAccessConditions, requestId);

    const res: GetContainerAccessPolicyRes = {
      properties: doc.properties,
      containerAcl: doc.containerAcl
    };

    return res;
  }

  /**
   * Set container access policy.
   *
   * @param {string} account
   * @param {string} container
   * @param {SetContainerAccessPolicyParam} setAclModel
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async setContainerACL(
    account: string,
    container: string,
    setAclModel: SetContainerAccessPolicyParam,
    context?: Context
  ): Promise<void> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerDoc(account, container, context);
    const requestId = context ? context.contextID : undefined;

    this.checkLeaseOnReadContainer(
      doc,
      setAclModel.leaseAccessConditions,
      requestId
    );

    doc.properties.publicAccess = setAclModel.publicAccess;
    doc.containerAcl = setAclModel.containerAcl;
    doc.properties.lastModified = setAclModel.lastModified;
    doc.properties.etag = setAclModel.etag;

    return coll.update(doc);
  }

  /**
   * Acquire container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {Models.ContainerAcquireLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<AcquireContainerLeaseRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async acquireContainerLease(
    account: string,
    container: string,
    options: Models.ContainerAcquireLeaseOptionalParams,
    context: Context
  ): Promise<AcquireContainerLeaseRes> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerDoc(account, container, context);
    const requestId = context ? context.contextID : undefined;

    // check the lease action aligned with current lease state.
    if (doc.properties.leaseState === Models.LeaseStateType.Breaking) {
      throw StorageErrorFactory.getLeaseAlreadyPresent(requestId);
    }
    if (
      doc.properties.leaseState === Models.LeaseStateType.Leased &&
      options.proposedLeaseId !== doc.leaseId
    ) {
      throw StorageErrorFactory.getLeaseAlreadyPresent(requestId);
    }

    // update the lease information
    if (options.duration === -1 || options.duration === undefined) {
      doc.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    } else {
      // verify options.duration between 15 and 60
      if (options.duration > 60 || options.duration < 15) {
        throw StorageErrorFactory.getInvalidLeaseDuration(requestId);
      }
      doc.properties.leaseDuration = Models.LeaseDurationType.Fixed;
      doc.leaseExpireTime = context.startTime!;
      doc.leaseExpireTime.setSeconds(
        doc.leaseExpireTime.getSeconds() + options.duration
      );
      doc.leaseduration = options.duration;
    }
    doc.properties.leaseState = Models.LeaseStateType.Leased;
    doc.properties.leaseStatus = Models.LeaseStatusType.Locked;
    doc.leaseId =
      options.proposedLeaseId !== "" && options.proposedLeaseId !== undefined
        ? options.proposedLeaseId
        : uuid();
    doc.leaseBreakExpireTime = undefined;

    coll.update(doc);
    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Release container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {Context} context
   * @returns {Promise<ReleaseContainerLeaseRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async releaseContainerLease(
    account: string,
    container: string,
    leaseId: string,
    context: Context
  ): Promise<ReleaseContainerLeaseRes> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerDoc(account, container, context);
    const requestId = context ? context.contextID : undefined;

    if (doc.properties.leaseState === Models.LeaseStateType.Available) {
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        requestId
      );
    }

    // Check lease ID
    if (doc.leaseId !== leaseId) {
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        requestId
      );
    }

    // update the lease information
    doc.properties.leaseState = Models.LeaseStateType.Available;
    doc.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
    doc.properties.leaseDuration = undefined;
    doc.leaseduration = undefined;
    doc.leaseId = undefined;
    doc.leaseExpireTime = undefined;
    doc.leaseBreakExpireTime = undefined;

    coll.update(doc);
    return doc.properties;
  }

  /**
   * Renew container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {Context} context
   * @returns {Promise<RenewContainerLeaseRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async renewContainerLease(
    account: string,
    container: string,
    leaseId: string,
    context: Context
  ): Promise<RenewContainerLeaseRes> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerDoc(account, container, context);
    const requestId = context ? context.contextID : undefined;

    // check the lease action aligned with current lease state.
    if (doc.properties.leaseState === Models.LeaseStateType.Available) {
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        requestId
      );
    }
    if (
      doc.properties.leaseState === Models.LeaseStateType.Breaking ||
      doc.properties.leaseState === Models.LeaseStateType.Broken
    ) {
      throw StorageErrorFactory.getLeaseIsBrokenAndCannotBeRenewed(requestId);
    }

    // Check lease ID
    if (doc.leaseId !== leaseId) {
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        requestId
      );
    }

    // update the lease information
    doc.properties.leaseState = Models.LeaseStateType.Leased;
    doc.properties.leaseStatus = Models.LeaseStatusType.Locked;
    // when container.leaseduration has value (not -1), means fixed duration
    if (doc.leaseduration !== undefined && doc.leaseduration !== -1) {
      doc.leaseExpireTime = context.startTime!;
      doc.leaseExpireTime.setSeconds(
        doc.leaseExpireTime.getSeconds() + doc.leaseduration
      );
      doc.properties.leaseDuration = Models.LeaseDurationType.Fixed;
    } else {
      doc.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    }

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Break container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {(number | undefined)} breakPeriod
   * @param {Context} context
   * @returns {Promise<BreakContainerLeaseRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async breakContainerLease(
    account: string,
    container: string,
    breakPeriod: number | undefined,
    context: Context
  ): Promise<BreakContainerLeaseRes> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerDoc(account, container, context);
    const requestId = context ? context.contextID : undefined;

    let leaseTimeinSecond: number;
    leaseTimeinSecond = 0;
    // check the lease action aligned with current lease state.
    if (doc.properties.leaseState === Models.LeaseStateType.Available) {
      throw StorageErrorFactory.getContainerLeaseNotPresentWithLeaseOperation(
        requestId
      );
    }

    // update the lease information
    // verify options.breakPeriod between 0 and 60
    if (breakPeriod !== undefined && (breakPeriod > 60 || breakPeriod < 0)) {
      throw StorageErrorFactory.getInvalidLeaseBreakPeriod(requestId);
    }
    if (
      doc.properties.leaseState === Models.LeaseStateType.Expired ||
      doc.properties.leaseState === Models.LeaseStateType.Broken ||
      breakPeriod === 0 ||
      breakPeriod === undefined
    ) {
      doc.properties.leaseState = Models.LeaseStateType.Broken;
      doc.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
      doc.properties.leaseDuration = undefined;
      doc.leaseduration = undefined;
      doc.leaseExpireTime = undefined;
      doc.leaseBreakExpireTime = undefined;
      leaseTimeinSecond = 0;
    } else {
      doc.properties.leaseState = Models.LeaseStateType.Breaking;
      doc.properties.leaseStatus = Models.LeaseStatusType.Locked;
      doc.leaseduration = undefined;
      if (doc.properties.leaseDuration === Models.LeaseDurationType.Infinite) {
        doc.properties.leaseDuration = undefined;
        doc.leaseExpireTime = undefined;
        doc.leaseBreakExpireTime = new Date(context.startTime!);
        doc.leaseBreakExpireTime.setSeconds(
          doc.leaseBreakExpireTime.getSeconds() + breakPeriod
        );
        leaseTimeinSecond = breakPeriod;
      } else {
        let newleaseBreakExpireTime = new Date(context.startTime!);
        newleaseBreakExpireTime.setSeconds(
          newleaseBreakExpireTime.getSeconds() + breakPeriod
        );
        if (
          doc.leaseExpireTime !== undefined &&
          newleaseBreakExpireTime > doc.leaseExpireTime
        ) {
          newleaseBreakExpireTime = doc.leaseExpireTime;
        }
        if (
          doc.leaseBreakExpireTime === undefined ||
          doc.leaseBreakExpireTime > newleaseBreakExpireTime
        ) {
          doc.leaseBreakExpireTime = newleaseBreakExpireTime;
        }
        leaseTimeinSecond = Math.round(
          Math.abs(
            doc.leaseBreakExpireTime.getTime() - context.startTime!.getTime()
          ) / 1000
        );
        doc.leaseExpireTime = undefined;
        doc.properties.leaseDuration = undefined;
      }
    }

    coll.update(doc);

    return { properties: doc.properties, leaseTime: leaseTimeinSecond };
  }

  /**
   * Change container lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Context} context
   * @returns {Promise<ChangeContainerLeaseRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async changeContainerLease(
    account: string,
    container: string,
    leaseId: string,
    proposedLeaseId: string,
    context: Context
  ): Promise<ChangeContainerLeaseRes> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerDoc(account, container, context);
    const requestId = context ? context.contextID : undefined;

    // check the lease action aligned with current lease state.
    if (
      doc.properties.leaseState === Models.LeaseStateType.Available ||
      doc.properties.leaseState === Models.LeaseStateType.Expired ||
      doc.properties.leaseState === Models.LeaseStateType.Broken
    ) {
      throw StorageErrorFactory.getContainerLeaseNotPresentWithLeaseOperation(
        requestId
      );
    }
    if (doc.properties.leaseState === Models.LeaseStateType.Breaking) {
      throw StorageErrorFactory.getLeaseIsBreakingAndCannotBeChanged(requestId);
    }

    // Check lease ID
    if (doc.leaseId !== leaseId && doc.leaseId !== proposedLeaseId) {
      throw StorageErrorFactory.getContainerLeaseIdMismatchWithLeaseOperation(
        requestId
      );
    }

    // update the lease information, only need update lease ID
    doc.leaseId = proposedLeaseId;

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Check the existence of a container.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async checkContainerExist(
    account: string,
    container: string,
    context?: Context
  ): Promise<void> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: container });
    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getContainerNotFound(requestId);
    }
  }

  /**
   * List blobs with query conditions specified.
   *
   * @param {string} [account]
   * @param {string} [container]
   * @param {string} [blob]
   * @param {string} [prefix=""]
   * @param {number} [maxResults=5000]
   * @param {string} [marker=""]
   * @param {boolean} [includeSnapshots]
   * @returns {(Promise<[BlobModel[], string | undefined]>)}
   * @memberof LokiBlobMetadataStore
   */
  public async listBlobs(
    account?: string,
    container?: string,
    blob?: string,
    prefix: string = "",
    maxResults: number = 5000,
    marker: string = "",
    includeSnapshots?: boolean
  ): Promise<[BlobModel[], string | undefined]> {
    const query: any = {};
    if (prefix !== "") {
      query.name = { $regex: `^${this.escapeRegex(prefix)}` };
    }
    if (blob !== undefined) {
      query.name = blob;
    }
    if (account !== undefined) {
      query.accountName = account;
    }
    if (container !== undefined) {
      query.containerName = container;
    }

    const coll = this.db.getCollection(this.BLOBS_COLLECTION);

    let docs;
    if (includeSnapshots === true) {
      docs = await coll
        .chain()
        .find(query)
        .where(obj => {
          return obj.name > marker!;
        })
        .simplesort("name")
        .limit(maxResults + 1)
        .data();
    } else {
      docs = await coll
        .chain()
        .find(query)
        .where(obj => {
          return obj.snapshot.length === 0 && obj.name > marker!;
        })
        .simplesort("name")
        .limit(maxResults + 1)
        .data();
    }

    for (const doc of docs) {
      const blobDoc = doc as BlobModel;
      blobDoc.properties.contentMD5 = this.restoreUint8Array(
        blobDoc.properties.contentMD5
      );
    }

    if (docs.length <= maxResults) {
      return [docs, undefined];
    } else {
      const nextMarker = docs[docs.length - 2].name;
      docs.pop();
      return [docs, nextMarker];
    }
  }

  /**
   * Create blob item in persistency layer. Will replace if blob exists.
   *
   * @param {BlobModel} blob
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async createBlob(blob: BlobModel, context?: Context): Promise<void> {
    await this.checkContainerExist(
      blob.accountName,
      blob.containerName,
      context
    );
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = coll.findOne({
      accountName: blob.accountName,
      containerName: blob.containerName,
      name: blob.name,
      snapshot: blob.snapshot
    });
    if (blobDoc) {
      if (
        blobDoc.properties !== undefined &&
        blobDoc.properties.accessTier === Models.AccessTier.Archive
      ) {
        throw StorageErrorFactory.getBlobArchived();
      }
      coll.remove(blobDoc);
    }
    delete (blob as any).$loki;
    return coll.insert(blob);
  }

  /**
   * Create snapshot.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Context} context
   * @returns {Promise<CreateSnapshotRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async createSnapshot(
    account: string,
    container: string,
    blob: string,
    context: Context
  ): Promise<CreateSnapshotRes> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );

    const snapshotBlob: BlobModel = {
      name: doc.name,
      deleted: false,
      snapshot: context.startTime!.toISOString(),
      properties: { ...doc.properties },
      metadata: { ...doc.metadata },
      accountName: doc.accountName,
      containerName: doc.containerName,
      pageRangesInOrder:
        doc.pageRangesInOrder === undefined
          ? undefined
          : doc.pageRangesInOrder.slice(),
      isCommitted: doc.isCommitted,
      leaseduration: doc.leaseduration,
      leaseId: doc.leaseId,
      leaseExpireTime: doc.leaseExpireTime,
      leaseBreakExpireTime: doc.leaseBreakExpireTime,
      committedBlocksInOrder:
        doc.committedBlocksInOrder === undefined
          ? undefined
          : doc.committedBlocksInOrder.slice(),
      persistency:
        doc.persistency === undefined ? undefined : { ...doc.persistency }
    };

    coll.insert(snapshotBlob);

    return {
      properties: snapshotBlob.properties,
      snapshot: snapshotBlob.snapshot
    };
  }

  /**
   * Update blob item in persistency layer. Will create if blob doesn't exist.
   *
   * @param {BlobModel} blob
   * @returns {Promise<BlobModel>}
   * @memberof LokiBlobMetadataStore
   */
  public async updateBlob(blob: BlobModel): Promise<BlobModel> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = coll.findOne({
      accountName: blob.accountName,
      containerName: blob.containerName,
      name: blob.name,
      snapshot: blob.snapshot
    });
    if (blobDoc) {
      coll.remove(blobDoc);
    }
    delete (blob as any).$loki;
    return coll.insert(blob);
  }

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   * Will return block list or page list as well for downloading.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot=""]
   * @param {Context} context
   * @returns {Promise<BlobModel>}
   * @memberof LokiBlobMetadataStore
   */
  public async downloadBlob(
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    context: Context
  ): Promise<BlobModel> {
    let doc = await this.getBlobDoc(
      account,
      container,
      blob,
      snapshot,
      context
    );
    doc.properties.contentMD5 = this.restoreUint8Array(
      doc.properties.contentMD5
    );
    doc = BlobHandler.updateLeaseAttributes(doc, context.startTime!);

    return doc;
  }

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   * Will return block list or page list as well for downloading.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @returns {(Promise<BlobModel | undefined>)}
   * @memberof LokiBlobMetadataStore
   */
  public async getBlob(
    account: string,
    container: string,
    blob: string,
    snapshot: string = ""
  ): Promise<BlobModel | undefined> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob,
      snapshot
    });

    if (blobDoc) {
      const blobModel = blobDoc as BlobModel;
      blobModel.properties.contentMD5 = this.restoreUint8Array(
        blobModel.properties.contentMD5
      );
      return blobDoc;
    } else {
      return undefined;
    }
  }

  /**
   * Get blob properties
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot=""]
   * @param {Context} context
   * @returns {Promise<GetBlobPropertiesRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async getBlobProperties(
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    context: Context
  ): Promise<GetBlobPropertiesRes> {
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      snapshot,
      context
    );

    // TODO: Lease for a snapshot blob?
    if (doc.snapshot === "") {
      BlobHandler.checkLeaseOnReadBlob(context, doc, leaseAccessConditions);
    }

    return { properties: doc.properties, metadata: doc.metadata };
  }

  /**
   * Delete blob or its snapshots.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.BlobDeleteMethodOptionalParams} options
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async deleteBlob(
    account: string,
    container: string,
    blob: string,
    options: Models.BlobDeleteMethodOptionalParams,
    context: Context
  ): Promise<void> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    await this.checkContainerExist(account, container, context);

    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      options.snapshot,
      context
    );
    const againstBaseBlob = doc.snapshot === "";

    // Check Lease status
    if (againstBaseBlob) {
      BlobHandler.checkBlobLeaseOnWriteBlob(
        context,
        doc,
        options.leaseAccessConditions
      );
    }

    // Check bad requests
    if (!againstBaseBlob && options.deleteSnapshots !== undefined) {
      throw StorageErrorFactory.getInvalidOperation(
        context.contextID!,
        "Invalid operation against a blob snapshot."
      );
    }

    // Scenario: Delete base blob only
    if (againstBaseBlob && options.deleteSnapshots === undefined) {
      const count = coll.count({
        accountName: account,
        containerName: container,
        blobName: blob
      });
      if (count > 1) {
        throw StorageErrorFactory.getSnapshotsPresent(context.contextID!);
      } else {
        coll.findAndRemove({
          accountName: account,
          containerName: container,
          name: blob
        });
      }
    }

    // Scenario: Delete one snapshot only
    if (!againstBaseBlob) {
      coll.findAndRemove({
        accountName: account,
        containerName: container,
        name: blob,
        snapshot: doc.snapshot
      });
    }

    // Scenario: Delete base blob and snapshots
    if (
      againstBaseBlob &&
      options.deleteSnapshots === Models.DeleteSnapshotsOptionType.Include
    ) {
      coll.findAndRemove({
        accountName: account,
        containerName: container,
        name: blob
      });
    }

    // Scenario: Delete all snapshots only
    if (
      againstBaseBlob &&
      options.deleteSnapshots === Models.DeleteSnapshotsOptionType.Only
    ) {
      const query = {
        accountName: account,
        containerName: container,
        name: blob,
        snapshot: { $gt: "" }
      };
      coll.findAndRemove(query);
    }
  }

  /**
   * Set blob HTTP headers.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {(Models.BlobHTTPHeaders | undefined)} blobHTTPHeaders
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async setBlobHTTPHeaders(
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    blobHTTPHeaders: Models.BlobHTTPHeaders | undefined,
    context: Context
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    let doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );
    // Check Lease status
    BlobHandler.checkBlobLeaseOnWriteBlob(context, doc, leaseAccessConditions);

    // Set lease to available if it's expired
    doc = BlobHandler.UpdateBlobLeaseStateOnWriteBlob(doc);

    const blobHeaders = blobHTTPHeaders;
    const blobProps = doc.properties;

    // as per https://docs.microsoft.com/en-us/rest/api/storageservices/set-blob-properties#remarks
    // If any one or more of the following properties is set in the request,
    // then all of these properties are set together.
    // If a value is not provided for a given property when at least one
    // of the properties listed below is set, then that property will
    // be cleared for the blob.
    if (blobHeaders !== undefined) {
      blobProps.cacheControl = blobHeaders.blobCacheControl;
      blobProps.contentType = blobHeaders.blobContentType;
      blobProps.contentMD5 = blobHeaders.blobContentMD5;
      blobProps.contentEncoding = blobHeaders.blobContentEncoding;
      blobProps.contentLanguage = blobHeaders.blobContentLanguage;
      blobProps.contentDisposition = blobHeaders.blobContentDisposition;
      blobProps.lastModified = context.startTime
        ? context.startTime
        : new Date();
    }

    doc.properties = blobProps;

    coll.update(doc);
    return doc.properties;
  }

  /**
   * Set blob metadata.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async setBlobMetadata(
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    metadata: Models.BlobMetadata | undefined,
    context: Context
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    let doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );

    // Check Lease status
    BlobHandler.checkBlobLeaseOnWriteBlob(context, doc, leaseAccessConditions);

    doc.metadata = metadata;

    // Set lease to available if it's expired
    doc = BlobHandler.UpdateBlobLeaseStateOnWriteBlob(doc);

    coll.update(doc);

    return doc.properties;
  }

  /**
   * Acquire blob lease.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.BlobAcquireLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<AcquireBlobLeaseRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async acquireBlobLease(
    account: string,
    container: string,
    blob: string,
    options: Models.BlobAcquireLeaseOptionalParams,
    context: Context
  ): Promise<AcquireBlobLeaseRes> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );

    // check the lease action aligned with current lease state.
    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
    }
    if (doc.properties.leaseState === Models.LeaseStateType.Breaking) {
      throw StorageErrorFactory.getLeaseAlreadyPresent(context.contextID!);
    }
    if (
      doc.properties.leaseState === Models.LeaseStateType.Leased &&
      options.proposedLeaseId !== doc.leaseId
    ) {
      throw StorageErrorFactory.getLeaseAlreadyPresent(context.contextID!);
    }

    // update the lease information
    if (options.duration === -1 || options.duration === undefined) {
      doc.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    } else {
      // verify options.duration between 15 and 60
      if (options.duration > 60 || options.duration < 15) {
        throw StorageErrorFactory.getInvalidLeaseDuration(context.contextID!);
      }
      doc.properties.leaseDuration = Models.LeaseDurationType.Fixed;
      doc.leaseExpireTime = context.startTime!;
      doc.leaseExpireTime.setSeconds(
        doc.leaseExpireTime.getSeconds() + options.duration
      );
      doc.leaseduration = options.duration;
    }
    doc.properties.leaseState = Models.LeaseStateType.Leased;
    doc.properties.leaseStatus = Models.LeaseStatusType.Locked;
    doc.leaseId =
      options.proposedLeaseId !== "" && options.proposedLeaseId !== undefined
        ? options.proposedLeaseId
        : uuid();
    doc.leaseBreakExpireTime = undefined;

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  public async releaseBlobLease(
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    context: Context
  ): Promise<ReleaseBlobLeaseRes> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );

    // check the lease action aligned with current lease state.
    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
    }
    if (doc.properties.leaseState === Models.LeaseStateType.Available) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        context.contextID!
      );
    }

    // Check lease ID
    if (doc.leaseId !== leaseId) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        context.contextID!
      );
    }

    // update the lease information
    doc.properties.leaseState = Models.LeaseStateType.Available;
    doc.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
    doc.properties.leaseDuration = undefined;
    doc.leaseduration = undefined;
    doc.leaseId = undefined;
    doc.leaseExpireTime = undefined;
    doc.leaseBreakExpireTime = undefined;

    coll.update(doc);

    return doc.properties;
  }

  /**
   * Renew blob lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @param {Context} context
   * @returns {Promise<RenewBlobLeaseRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async renewBlobLease(
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    context: Context
  ): Promise<RenewBlobLeaseRes> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );

    // check the lease action aligned with current lease state.
    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
    }
    if (doc.properties.leaseState === Models.LeaseStateType.Available) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        context.contextID!
      );
    }
    if (
      doc.properties.leaseState === Models.LeaseStateType.Breaking ||
      doc.properties.leaseState === Models.LeaseStateType.Broken
    ) {
      throw StorageErrorFactory.getLeaseIsBrokenAndCannotBeRenewed(
        context.contextID!
      );
    }

    // Check lease ID
    if (doc.leaseId !== leaseId) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        context.contextID!
      );
    }

    // update the lease information
    doc.properties.leaseState = Models.LeaseStateType.Leased;
    doc.properties.leaseStatus = Models.LeaseStatusType.Locked;
    // when container.leaseduration has value (not -1), means fixed duration
    if (doc.leaseduration !== undefined && doc.leaseduration !== -1) {
      doc.leaseExpireTime = context.startTime!;
      doc.leaseExpireTime.setSeconds(
        doc.leaseExpireTime.getSeconds() + doc.leaseduration
      );
      doc.properties.leaseDuration = Models.LeaseDurationType.Fixed;
    } else {
      doc.properties.leaseDuration = Models.LeaseDurationType.Infinite;
    }

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Change blob lease
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Context} context
   * @returns {Promise<ChangeBlobLeaseRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async changeBlobLease(
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    proposedLeaseId: string,
    context: Context
  ): Promise<ChangeBlobLeaseRes> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );

    // check the lease action aligned with current lease state.
    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
    }
    if (
      doc.properties.leaseState === Models.LeaseStateType.Available ||
      doc.properties.leaseState === Models.LeaseStateType.Expired ||
      doc.properties.leaseState === Models.LeaseStateType.Broken
    ) {
      throw StorageErrorFactory.getBlobLeaseNotPresentWithLeaseOperation(
        context.contextID!
      );
    }
    if (doc.properties.leaseState === Models.LeaseStateType.Breaking) {
      throw StorageErrorFactory.getLeaseIsBreakingAndCannotBeChanged(
        context.contextID!
      );
    }

    // Check lease ID
    if (doc.leaseId !== leaseId && doc.leaseId !== proposedLeaseId) {
      throw StorageErrorFactory.getBlobLeaseIdMismatchWithLeaseOperation(
        context.contextID!
      );
    }

    // update the lease information, only need update lease ID
    doc.leaseId = proposedLeaseId;

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Break blob lease.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(number | undefined)} breakPeriod
   * @param {Context} context
   * @returns {Promise<BreakBlobLeaseRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async breakBlobLease(
    account: string,
    container: string,
    blob: string,
    breakPeriod: number | undefined,
    context: Context
  ): Promise<BreakBlobLeaseRes> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );
    let leaseTimeinSecond: number = 0;

    // check the lease action aligned with current lease state.
    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
    }
    if (doc.properties.leaseState === Models.LeaseStateType.Available) {
      throw StorageErrorFactory.getBlobLeaseNotPresentWithLeaseOperation(
        context.contextID!
      );
    }

    // update the lease information
    // verify options.breakPeriod between 0 and 60
    if (breakPeriod !== undefined && (breakPeriod > 60 || breakPeriod < 0)) {
      throw StorageErrorFactory.getInvalidLeaseBreakPeriod(context.contextID!);
    }
    if (
      doc.properties.leaseState === Models.LeaseStateType.Expired ||
      doc.properties.leaseState === Models.LeaseStateType.Broken ||
      breakPeriod === 0 ||
      breakPeriod === undefined
    ) {
      doc.properties.leaseState = Models.LeaseStateType.Broken;
      doc.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
      doc.properties.leaseDuration = undefined;
      doc.leaseduration = undefined;
      doc.leaseExpireTime = undefined;
      doc.leaseBreakExpireTime = undefined;
      leaseTimeinSecond = 0;
    } else {
      doc.properties.leaseState = Models.LeaseStateType.Breaking;
      doc.properties.leaseStatus = Models.LeaseStatusType.Locked;
      doc.leaseduration = undefined;
      if (doc.properties.leaseDuration === Models.LeaseDurationType.Infinite) {
        doc.properties.leaseDuration = undefined;
        doc.leaseExpireTime = undefined;
        doc.leaseBreakExpireTime = new Date(context.startTime!);
        doc.leaseBreakExpireTime.setSeconds(
          doc.leaseBreakExpireTime.getSeconds() + breakPeriod
        );
        leaseTimeinSecond = breakPeriod;
      } else {
        let newleaseBreakExpireTime = new Date(context.startTime!);
        newleaseBreakExpireTime.setSeconds(
          newleaseBreakExpireTime.getSeconds() + breakPeriod
        );
        if (
          doc.leaseExpireTime !== undefined &&
          newleaseBreakExpireTime > doc.leaseExpireTime
        ) {
          newleaseBreakExpireTime = doc.leaseExpireTime;
        }
        if (
          doc.leaseBreakExpireTime === undefined ||
          doc.leaseBreakExpireTime > newleaseBreakExpireTime
        ) {
          doc.leaseBreakExpireTime = newleaseBreakExpireTime;
        }
        leaseTimeinSecond = Math.round(
          Math.abs(
            doc.leaseBreakExpireTime.getTime() - context.startTime!.getTime()
          ) / 1000
        );
        doc.leaseExpireTime = undefined;
        doc.properties.leaseDuration = undefined;
      }
    }

    coll.update(doc);
    return { properties: doc.properties, leaseTime: leaseTimeinSecond };
  }

  /**
   * Check the existence of a blob.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot=""]
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async checkBlobExist(
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    context?: Context
  ): Promise<void> {
    await this.checkContainerExist(account, container, context);

    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob,
      snapshot
    });

    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getBlobNotFound(requestId);
    }
  }

  /**
   * Get blobType and committed status for SAS authentication.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot=""]
   * @returns {(Promise<
   *     { blobType: Models.BlobType | undefined; isCommitted: boolean } | undefined
   *   >)}
   * @memberof LokiBlobMetadataStore
   */
  public async getBlobType(
    account: string,
    container: string,
    blob: string,
    snapshot: string = ""
  ): Promise<
    { blobType: Models.BlobType | undefined; isCommitted: boolean } | undefined
  > {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob,
      snapshot
    });
    if (!doc) {
      return undefined;
    }
    return { blobType: doc.properties.blobType, isCommitted: doc.isCommitted };
  }

  /**
   * start copy from Url
   *
   * @param {BlobId} source
   * @param {BlobId} destination
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {(Models.AccessTier | undefined)} tier
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async startCopyFromURL(
    source: BlobId,
    destination: BlobId,
    copySource: string,
    metadata: Models.BlobMetadata | undefined,
    tier: Models.AccessTier | undefined,
    context: Context
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      source.account,
      source.container,
      source.blob,
      source.snapshot,
      context
    );

    // If source is uncommitted or deleted
    if (doc === undefined || doc.deleted || !doc.isCommitted) {
      throw StorageErrorFactory.getBlobNotFound(context.contextID!);
    }

    if (doc.properties.accessTier === Models.AccessTier.Archive) {
      throw StorageErrorFactory.getBlobArchived(context.contextID!);
    }

    await this.checkContainerExist(destination.account, destination.container);

    // Deep clone a copied blob
    const copiedBlob: BlobModel = {
      name: destination.blob,
      deleted: false,
      snapshot: "",
      properties: {
        ...doc.properties,
        creationTime: context.startTime!,
        lastModified: context.startTime!,
        etag: newEtag(),
        leaseStatus: Models.LeaseStatusType.Unlocked,
        leaseState: Models.LeaseStateType.Available,
        leaseDuration: undefined,
        copyId: uuid(),
        copyStatus: Models.CopyStatusType.Success,
        copySource,
        copyProgress: doc.properties.contentLength
          ? `${doc.properties.contentLength}/${doc.properties.contentLength}`
          : undefined,
        copyCompletionTime: context.startTime,
        copyStatusDescription: undefined,
        incrementalCopy: false,
        destinationSnapshot: undefined,
        deletedTime: undefined,
        remainingRetentionDays: undefined,
        archiveStatus: undefined,
        accessTierChangeTime: undefined
      },
      metadata:
        metadata === undefined || Object.keys(metadata).length === 0
          ? { ...doc.metadata }
          : metadata,
      accountName: destination.account,
      containerName: destination.container,
      pageRangesInOrder: doc.pageRangesInOrder,
      isCommitted: doc.isCommitted,
      leaseduration: undefined,
      leaseId: undefined,
      leaseExpireTime: undefined,
      leaseBreakExpireTime: undefined,
      committedBlocksInOrder: doc.committedBlocksInOrder,
      persistency: doc.persistency
    };

    if (
      copiedBlob.properties.blobType === Models.BlobType.BlockBlob &&
      tier !== undefined
    ) {
      copiedBlob.properties.accessTier = this.parseTier(tier);
      if (copiedBlob.properties.accessTier === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context.contextID, {
          HeaderName: "x-ms-access-tier",
          HeaderValue: `${tier}`
        });
      }
    }

    coll.insert(copiedBlob);
    return copiedBlob.properties;
  }

  /**
   * Update Tier for a blob.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.AccessTier} tier
   * @param {Context} context
   * @returns {(Promise<200 | 202>)}
   * @memberof LokiBlobMetadataStore
   */
  public async setTier(
    account: string,
    container: string,
    blob: string,
    tier: Models.AccessTier,
    context: Context
  ): Promise<200 | 202> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );
    let responseCode: 200 | 202 = 200;

    // check the lease action aligned with current lease state.
    // the API has not lease ID input, but run it on a lease blocked blob will fail with LeaseIdMissing,
    // this is aliged with server behavior
    BlobHandler.checkBlobLeaseOnWriteBlob(context, doc, undefined);

    // Check Blob is not snapshot
    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextID!);
    }

    // Check BlobTier matches blob type
    if (
      (tier === Models.AccessTier.Archive ||
        tier === Models.AccessTier.Cool ||
        tier === Models.AccessTier.Hot) &&
      doc.properties.blobType === Models.BlobType.BlockBlob
    ) {
      // Block blob
      // tslint:disable-next-line:max-line-length
      // TODO: check blob is not block blob with snapshot, throw StorageErrorFactory.getBlobSnapshotsPresent_hassnapshot()

      // Archive -> Coo/Hot will return 202
      if (
        doc.properties.accessTier === Models.AccessTier.Archive &&
        (tier === Models.AccessTier.Cool || tier === Models.AccessTier.Hot)
      ) {
        responseCode = 202;
      }

      doc.properties.accessTier = tier;
      doc.properties.accessTierChangeTime = context.startTime;
    } else {
      throw StorageErrorFactory.getBlobInvalidBlobType(context.contextID!);
    }

    coll.update(doc);

    return responseCode;
  }

  /**
   * Update blob block item in persistency layer. Will create if block doesn't exist.
   * Will also create a uncommitted block blob.
   *
   * @param {BlockModel} block
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async stageBlock(block: BlockModel, context: Context): Promise<void> {
    await this.checkContainerExist(
      block.accountName,
      block.containerName,
      context
    );
    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    const blockDoc = coll.findOne({
      accountName: block.accountName,
      containerName: block.containerName,
      blobName: block.blobName,
      name: block.name,
      isCommitted: block.isCommitted
    });

    if (blockDoc) {
      coll.remove(blockDoc);
    } else {
      delete (block as any).$loki;
      coll.insert(block);
    }

    const blobColl = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = blobColl.findOne({
      accountName: block.accountName,
      containerName: block.containerName,
      name: block.blobName
    });

    if (!blobDoc) {
      const etag = newEtag();
      const newBlob = {
        deleted: false,
        accountName: block.accountName,
        containerName: block.containerName,
        name: block.blobName,
        properties: {
          creationTime: context.startTime,
          lastModified: context.startTime,
          etag,
          contentLength: block.persistency.count,
          blobType: Models.BlobType.BlockBlob
        },
        snapshot: "",
        isCommitted: false
      };
      blobColl.insert(newBlob);
    }
  }

  /**
   * Commit block list for a blob.
   *
   * @param {BlobModel} blob
   * @param {{ blockName: string; blockCommitType: string }[]} blockList
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async commitBlockList(
    blob: BlobModel,
    blockList: { blockName: string; blockCommitType: string }[],
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    context: Context
  ): Promise<void> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    let doc = await this.getBlobDoc(
      blob.accountName,
      blob.containerName,
      blob.name,
      blob.snapshot,
      context
    );

    // Check Lease status
    BlobHandler.checkBlobLeaseOnWriteBlob(context, doc, leaseAccessConditions);

    // Get all blocks in persistency layer
    const blockColl = this.db.getCollection(this.BLOCKS_COLLECTION);
    const pUncommittedBlocks = blockColl
      .chain()
      .find({
        accountName: blob.accountName,
        containerName: blob.containerName,
        blobName: blob.name
      })
      .data();

    const pCommittedBlocksMap: Map<string, PersistencyBlockModel> = new Map(); // persistencyCommittedBlocksMap
    for (const pBlock of blob.committedBlocksInOrder || []) {
      pCommittedBlocksMap.set(pBlock.name, pBlock);
    }

    const pUncommittedBlocksMap: Map<string, PersistencyBlockModel> = new Map(); // persistencyUncommittedBlocksMap
    for (const pBlock of pUncommittedBlocks) {
      if (!pBlock.isCommitted) {
        pUncommittedBlocksMap.set(pBlock.name, pBlock);
      }
    }

    const selectedBlockList: PersistencyBlockModel[] = [];
    for (const block_1 of blockList) {
      switch (block_1.blockCommitType.toLowerCase()) {
        case "uncommitted":
          const pUncommittedBlock = pUncommittedBlocksMap.get(
            block_1.blockName
          );
          if (pUncommittedBlock === undefined) {
            throw StorageErrorFactory.getInvalidOperation(context.contextID!);
          } else {
            selectedBlockList.push(pUncommittedBlock);
          }
          break;
        case "committed":
          const pCommittedBlock = pCommittedBlocksMap.get(block_1.blockName);
          if (pCommittedBlock === undefined) {
            throw StorageErrorFactory.getInvalidOperation(context.contextID!);
          } else {
            selectedBlockList.push(pCommittedBlock);
          }
          break;
        case "latest":
          const pLatestBlock =
            pUncommittedBlocksMap.get(block_1.blockName) ||
            pCommittedBlocksMap.get(block_1.blockName);
          if (pLatestBlock === undefined) {
            throw StorageErrorFactory.getInvalidOperation(context.contextID!);
          } else {
            selectedBlockList.push(pLatestBlock);
          }
          break;
        default:
          throw StorageErrorFactory.getInvalidOperation(context.contextID!);
      }
    }

    // Commit block list
    doc.committedBlocksInOrder = selectedBlockList;
    doc.isCommitted = true;

    doc.metadata = blob.metadata;
    doc.properties.accessTier = blob.properties.accessTier;
    doc.properties.etag = blob.properties.etag;
    doc.properties.accessTierInferred = true;
    doc.properties.cacheControl = blob.properties.cacheControl;
    doc.properties.contentType = blob.properties.contentType;
    doc.properties.contentMD5 = blob.properties.contentMD5;
    doc.properties.contentEncoding = blob.properties.contentEncoding;
    doc.properties.contentLanguage = blob.properties.contentLanguage;
    doc.properties.contentDisposition = blob.properties.contentDisposition;
    doc.properties.contentLength = selectedBlockList
      .map(block => block.size)
      .reduce((total, val) => {
        return total + val;
      });

    // set lease state to available if it's expired
    doc = BlobHandler.UpdateBlobLeaseStateOnWriteBlob(doc);

    coll.update(doc);

    blockColl.findAndRemove({
      accountName: blob.accountName,
      containerName: blob.containerName,
      blobName: blob.name
    });
  }

  /**
   * Gets blocks list for a blob from persistency layer by account, container and blob names.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(boolean | undefined)} isCommitted
   * @param {Context} context
   * @returns {Promise<{
   *     properties: Models.BlobProperties;
   *     uncommittedBlocks: Models.Block[];
   *     committedBlocks: Models.Block[];
   *   }>}
   * @memberof LokiBlobMetadataStore
   */
  public async getBlockList(
    account: string,
    container: string,
    blob: string,
    isCommitted: boolean | undefined,
    context: Context
  ): Promise<{
    properties: Models.BlobProperties;
    uncommittedBlocks: Models.Block[];
    committedBlocks: Models.Block[];
  }> {
    const blobDoc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );

    const res: {
      properties: Models.BlobProperties;
      uncommittedBlocks: Models.Block[];
      committedBlocks: Models.Block[];
    } = {
      properties: blobDoc.properties,
      uncommittedBlocks: [],
      committedBlocks: []
    };

    if (isCommitted !== false && blobDoc.committedBlocksInOrder !== undefined) {
      res.committedBlocks = blobDoc.committedBlocksInOrder;
    }

    if (isCommitted !== true) {
      const blockColl = this.db.getCollection(this.BLOCKS_COLLECTION);
      const blocks = await blockColl
        .chain()
        .find({
          accountName: account,
          containerName: container,
          blobName: blob
        })
        .simplesort("$loki")
        .data();

      for (const item of blocks) {
        res.uncommittedBlocks.push(item);
      }
    }

    return res;
  }

  /**
   * Upload new pages for pageblob.
   *
   * @param {BlobModel} blob
   * @param {number} start
   * @param {number} end
   * @param {IPersistencyChunk} persistency
   * @param {Context} [context]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async uploadPages(
    blob: BlobModel,
    start: number,
    end: number,
    persistency: IPersistencyChunk,
    context?: Context
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    let doc = await this.getBlobDoc(
      blob.accountName,
      blob.containerName,
      blob.name,
      blob.snapshot,
      context
    );

    this.pageBlobRangesManager.mergeRange(doc.pageRangesInOrder || [], {
      start,
      end,
      persistency
    });

    // set lease state to available if it's expired
    doc = BlobHandler.UpdateBlobLeaseStateOnWriteBlob(doc);

    doc.properties.etag = newEtag();

    coll.update(doc);

    return doc.properties;
  }

  /**
   * Clear range for a pageblob.
   *
   * @param {BlobModel} blob
   * @param {number} start
   * @param {number} end
   * @param {Context} [context]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async clearRange(
    blob: BlobModel,
    start: number,
    end: number,
    context?: Context
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    let doc = await this.getBlobDoc(
      blob.accountName,
      blob.containerName,
      blob.name,
      blob.snapshot,
      context
    );

    this.pageBlobRangesManager.clearRange(doc.pageRangesInOrder || [], {
      start,
      end
    });

    // set lease state to available if it's expired
    doc = BlobHandler.UpdateBlobLeaseStateOnWriteBlob(doc);

    doc.properties.etag = newEtag();

    coll.update(doc);

    return doc.properties;
  }

  /**
   * Returns the list of valid page ranges for a page blob or snapshot of a page blob.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @param {Context} [context]
   * @returns {Promise<GetPageRangeRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async getPageRanges(
    account: string,
    container: string,
    blob: string,
    snapshot?: string,
    context?: Context
  ): Promise<GetPageRangeRes> {
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      snapshot,
      context
    );

    return {
      properties: doc.properties,
      pageRangesInOrder: doc.pageRangesInOrder
    };
  }

  /**
   * Resize a page blob.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {number} blobContentLength
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async resizePageBlob(
    account: string,
    container: string,
    blob: string,
    blobContentLength: number,
    context: Context
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );
    const requestId = context ? context.contextID : undefined;

    if (doc.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getInvalidOperation(
        requestId,
        "Resize could only be against a page blob."
      );
    }

    doc.pageRangesInOrder = doc.pageRangesInOrder || [];
    if (doc.properties.contentLength! > blobContentLength) {
      const start = blobContentLength;
      const end = doc.properties.contentLength! - 1;
      this.pageBlobRangesManager.clearRange(doc.pageRangesInOrder || [], {
        start,
        end
      });
    }

    doc.properties.contentLength = blobContentLength;
    doc.properties.lastModified = context.startTime!;

    doc.properties.etag = newEtag();

    coll.update(doc);
    return doc.properties;
  }

  /**
   * Upadate the sequence number of a page blob.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.SequenceNumberActionType} sequenceNumberAction
   * @param {(number | undefined)} blobSequenceNumber
   * @param {Context} context
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async updateSequenceNumber(
    account: string,
    container: string,
    blob: string,
    sequenceNumberAction: Models.SequenceNumberActionType,
    blobSequenceNumber: number | undefined,
    context: Context
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobDoc(
      account,
      container,
      blob,
      undefined,
      context
    );

    if (doc.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getInvalidOperation(
        context.contextID!,
        "Get Page Ranges could only be against a page blob."
      );
    }

    if (doc.properties.blobSequenceNumber === undefined) {
      doc.properties.blobSequenceNumber = 0;
    }

    switch (sequenceNumberAction) {
      case Models.SequenceNumberActionType.Max:
        if (blobSequenceNumber === undefined) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextID!,
            "x-ms-blob-sequence-number is required when x-ms-sequence-number-action is set to max."
          );
        }
        doc.properties.blobSequenceNumber = Math.max(
          doc.properties.blobSequenceNumber,
          blobSequenceNumber
        );
        break;
      case Models.SequenceNumberActionType.Increment:
        if (blobSequenceNumber !== undefined) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextID!,
            "x-ms-blob-sequence-number cannot be provided when x-ms-sequence-number-action is set to increment."
          );
        }
        doc.properties.blobSequenceNumber++;
        break;
      case Models.SequenceNumberActionType.Update:
        if (blobSequenceNumber === undefined) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextID!,
            "x-ms-blob-sequence-number is required when x-ms-sequence-number-action is set to update."
          );
        }
        doc.properties.blobSequenceNumber = blobSequenceNumber;
        break;
      default:
        throw StorageErrorFactory.getInvalidOperation(
          context.contextID!,
          "Unsupported x-ms-sequence-number-action value."
        );
    }

    doc.properties.etag = newEtag();

    coll.update(doc);
    return doc.properties;
  }

  /**
   * LokiJS will persist Uint8Array into Object.
   * This method will restore object to Uint8Array.
   *
   * @private
   * @param {*} obj
   * @returns {(Uint8Array | undefined)}
   * @memberof LokiBlobMetadataStore
   */
  private restoreUint8Array(obj: any): Uint8Array | undefined {
    if (typeof obj !== "object") {
      return undefined;
    }

    if (obj instanceof Uint8Array) {
      return obj;
    }

    if (obj.type === "Buffer") {
      obj = obj.data;
    }

    const length = Object.keys(obj).length;
    const arr = Buffer.allocUnsafe(length);

    for (let i = 0; i < length; i++) {
      if (!obj.hasOwnProperty(i)) {
        throw new TypeError(
          `Cannot restore loki DB persisted object to Uint8Array. Key ${i} is missing.`
        );
      }

      arr[i] = obj[i];
    }

    return arr;
  }

  /**
   * Escape a string to be used as a regex.
   *
   * @private
   * @param {string} regex
   * @returns {string}
   * @memberof LokiBlobMetadataStore
   */
  private escapeRegex(regex: string): string {
    return regex.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  /**
   * Get a container doc from collections.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} [context]
   * @returns {Promise<ContainerModel>}
   * @memberof LokiBlobMetadataStore
   */
  private async getContainerDoc(
    account: string,
    container: string,
    context?: Context
  ): Promise<ContainerModel> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    let doc = coll.findOne({ accountName: account, name: container });
    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getContainerNotFound(requestId);
    }

    doc = this.updateLeaseAttributes(
      doc,
      context ? context.startTime! : new Date()
    );
    return doc;
  }

  /**
   * Update container lease Attributes according to the current time.
   * The Attribute not set back
   *
   * @private
   * @param {ContainerModel} container
   * @param {Date} currentTime
   * @returns {ContainerModel}
   * @memberof LokiBlobMetadataStore
   */
  private updateLeaseAttributes(
    container: ContainerModel,
    currentTime: Date
  ): ContainerModel {
    // check Leased -> Expired
    if (
      container.properties.leaseState === Models.LeaseStateType.Leased &&
      container.properties.leaseDuration === Models.LeaseDurationType.Fixed
    ) {
      if (
        container.leaseExpireTime !== undefined &&
        currentTime > container.leaseExpireTime
      ) {
        container.properties.leaseState = Models.LeaseStateType.Expired;
        container.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
        container.properties.leaseDuration = undefined;
        container.leaseExpireTime = undefined;
        container.leaseBreakExpireTime = undefined;
      }
    }

    // check Breaking -> Broken
    if (container.properties.leaseState === Models.LeaseStateType.Breaking) {
      if (
        container.leaseBreakExpireTime !== undefined &&
        currentTime > container.leaseBreakExpireTime
      ) {
        container.properties.leaseState = Models.LeaseStateType.Broken;
        container.properties.leaseStatus = Models.LeaseStatusType.Unlocked;
        container.properties.leaseDuration = undefined;
        container.leaseExpireTime = undefined;
        container.leaseBreakExpireTime = undefined;
      }
    }
    return container;
  }

  /**
   * Check Container lease status on Read Container.
   *
   * @private
   * @param {Context} context
   * @param {ContainerModel} container
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @memberof LokiBlobMetadataStore
   */
  private checkLeaseOnReadContainer(
    container: ContainerModel,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    requestId?: string
  ): void {
    // check only when input Leased Id is not empty
    if (
      leaseAccessConditions !== undefined &&
      leaseAccessConditions.leaseId !== undefined &&
      leaseAccessConditions.leaseId !== ""
    ) {
      // return error when lease is unlocked
      if (
        container.properties.leaseStatus === Models.LeaseStatusType.Unlocked
      ) {
        throw StorageErrorFactory.getContainerLeaseLost(requestId);
      } else if (
        container.leaseId !== undefined &&
        leaseAccessConditions.leaseId.toLowerCase() !==
          container.leaseId.toLowerCase()
      ) {
        // return error when lease is locked but lease ID not match
        throw StorageErrorFactory.getContainerLeaseIdMismatchWithContainerOperation(
          requestId
        );
      }
    }
  }

  /**
   * Get a blob doc from collections.
   *
   * @private
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} snapshot
   * @param {Context} [context]
   * @returns {Promise<BlobModel>}
   * @memberof LokiBlobMetadataStore
   */
  private async getBlobDoc(
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    context?: Context
  ): Promise<BlobModel> {
    await this.checkContainerExist(account, container, context);

    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    let doc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob,
      snapshot
    });

    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getBlobNotFound(requestId);
    }

    doc = BlobHandler.updateLeaseAttributes(
      doc,
      context ? context.startTime! : new Date()
    );

    return doc;
  }

  /**
   * Get the tier setting from request headers.
   *
   * @private
   * @param {string} tier
   * @returns {(Models.AccessTier | undefined)}
   * @memberof BlobHandler
   */
  private parseTier(tier: string): Models.AccessTier | undefined {
    tier = tier.toLowerCase();
    if (tier === Models.AccessTier.Hot.toLowerCase()) {
      return Models.AccessTier.Hot;
    }
    if (tier === Models.AccessTier.Cool.toLowerCase()) {
      return Models.AccessTier.Cool;
    }
    if (tier === Models.AccessTier.Archive.toLowerCase()) {
      return Models.AccessTier.Archive;
    }
    return undefined;
  }
}
