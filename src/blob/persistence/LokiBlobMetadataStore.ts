import { stat } from "fs";
import Loki from "lokijs";
import uuid from "uuid/v4";

import IGCExtentProvider from "../../common/IGCExtentProvider";
import {
  convertDateTimeStringMsTo7Digital,
  rimrafAsync
} from "../../common/utils/utils";
import { lfsa } from "../../common/utils/utils";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import { LeaseStatusType } from "../generated/artifacts/models";
import Context from "../generated/Context";
import PageBlobRangesManager from "../handlers/PageBlobRangesManager";
import BlobLeaseAdapter from "../lease/BlobLeaseAdapter";
import BlobLeaseSyncer from "../lease/BlobLeaseSyncer";
import BlobReadLeaseValidator from "../lease/BlobReadLeaseValidator";
import BlobWriteLeaseSyncer from "../lease/BlobWriteLeaseSyncer";
import BlobWriteLeaseValidator from "../lease/BlobWriteLeaseValidator";
import ContainerDeleteLeaseValidator from "../lease/ContainerDeleteLeaseValidator";
import ContainerLeaseAdapter from "../lease/ContainerLeaseAdapter";
import ContainerLeaseSyncer from "../lease/ContainerLeaseSyncer";
import ContainerReadLeaseValidator from "../lease/ContainerReadLeaseValidator";
import { ILease } from "../lease/ILeaseState";
import LeaseFactory from "../lease/LeaseFactory";
import {
  DEFAULT_LIST_BLOBS_MAX_RESULTS,
  DEFAULT_LIST_CONTAINERS_MAX_RESULTS
} from "../utils/constants";
import { newEtag } from "../utils/utils";
import BlobReferredExtentsAsyncIterator from "./BlobReferredExtentsAsyncIterator";
import IBlobMetadataStore, {
  AcquireBlobLeaseResponse,
  AcquireContainerLeaseResponse,
  BlobId,
  BlobModel,
  BlockModel,
  BreakBlobLeaseResponse,
  BreakContainerLeaseResponse,
  ChangeBlobLeaseResponse,
  ChangeContainerLeaseResponse,
  ContainerModel,
  CreateSnapshotResponse,
  GetBlobPropertiesRes,
  GetContainerAccessPolicyResponse,
  GetContainerPropertiesResponse,
  GetPageRangeResponse,
  IContainerMetadata,
  IExtentChunk,
  PersistencyBlockModel,
  ReleaseBlobLeaseResponse,
  ReleaseContainerLeaseResponse,
  RenewBlobLeaseResponse,
  RenewContainerLeaseResponse,
  ServicePropertiesModel,
  SetContainerAccessPolicyOptions
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
      adapter: new lfsa(),
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

  /**
   * Clean LokiBlobMetadataStore.
   *
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async clean(): Promise<void> {
    if (this.isClosed()) {
      await rimrafAsync(this.lokiDBPath);

      // Remove separate metadata collection json files generated by LokiFsStructuredAdapter
      const searchScope = 20; // Should be larger than number of collections for every loki database
      for (let i = 0; i < searchScope; i++) {
        await rimrafAsync(`${this.lokiDBPath}.${i}`);
      }

      return;
    }
    throw new Error(`Cannot clean LokiBlobMetadataStore, it's not closed.`);
  }

  public iteratorExtents(): AsyncIterator<string[]> {
    return new BlobReferredExtentsAsyncIterator(this);
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
    context: Context,
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
    context: Context,
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
   * @param {number} [maxResults=5000]
   * @param {string} [marker=""]
   * @returns {(Promise<[ContainerModel[], string | undefined]>)}
   * @memberof LokiBlobMetadataStore
   */
  public async listContainers(
    context: Context,
    account: string,
    prefix: string = "",
    maxResults: number = DEFAULT_LIST_CONTAINERS_MAX_RESULTS,
    marker: string = ""
  ): Promise<[ContainerModel[], string | undefined]> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);

    const query =
      prefix === ""
        ? { name: { $gt: marker }, accountName: account }
        : {
            name: { $regex: `^${this.escapeRegex(prefix)}`, $gt: marker },
            accountName: account
          };

    // Workaround for loki which will ignore $gt when providing $regex
    const query2 = { name: { $gt: marker } };

    const docs = coll
      .chain()
      .find(query)
      .find(query2)
      .limit(maxResults + 1)
      .simplesort("name")
      .data();

    if (docs.length <= maxResults) {
      return [
        docs.map(doc => {
          return LeaseFactory.createLeaseState(
            new ContainerLeaseAdapter(doc),
            context
          ).sync(new ContainerLeaseSyncer(doc));
        }),
        undefined
      ];
    } else {
      // In this case, the last item is the one we get in addition, should set the Marker before it.
      const nextMarker = docs[docs.length - 2].name;
      docs.pop();
      return [
        docs.map(doc => {
          return LeaseFactory.createLeaseState(
            new ContainerLeaseAdapter(doc),
            context
          ).sync(new ContainerLeaseSyncer(doc));
        }),
        nextMarker
      ];
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
    context: Context,
    container: ContainerModel
  ): Promise<ContainerModel> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({
      accountName: container.accountName,
      name: container.name
    });

    if (doc) {
      const requestId = context ? context.contextId : undefined;
      throw StorageErrorFactory.getContainerAlreadyExists(requestId);
    }

    return coll.insert(container);
  }

  /**
   * Get container properties.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} context
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @returns {Promise<GetContainerPropertiesResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async getContainerProperties(
    context: Context,
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<GetContainerPropertiesResponse> {
    const doc = await this.getContainerWithLeaseUpdated(
      account,
      container,
      context
    );

    new ContainerReadLeaseValidator(leaseAccessConditions).validate(
      new ContainerLeaseAdapter(doc),
      context
    );

    const res: GetContainerPropertiesResponse = {
      name: container,
      properties: doc.properties,
      metadata: doc.metadata
    };

    return res;
  }

  /**
   * Delete container item if exists from persistency layer.
   *
   * Loki based implementation will delete container documents from Containers collection,
   * blob documents from Blobs collection, and blocks documents from Blocks collection immediately.
   *
   * Persisted extents data will be deleted by GC.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} context
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async deleteContainer(
    context: Context,
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<void> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerWithLeaseUpdated(
      account,
      container,
      context
    );

    new ContainerDeleteLeaseValidator(leaseAccessConditions).validate(
      new ContainerLeaseAdapter(doc),
      context
    );

    coll.remove(doc);

    const blobColl = this.db.getCollection(this.BLOBS_COLLECTION);
    blobColl.findAndRemove({
      accountName: account,
      containerName: container
    });

    const blockColl = this.db.getCollection(this.BLOCKS_COLLECTION);
    blockColl.findAndRemove({
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
   * @param {Context} context
   * @param {IContainerMetadata} [metadata]
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async setContainerMetadata(
    context: Context,
    account: string,
    container: string,
    lastModified: Date,
    etag: string,
    metadata?: IContainerMetadata,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<void> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerWithLeaseUpdated(
      account,
      container,
      context
    );

    new ContainerReadLeaseValidator(leaseAccessConditions).validate(
      new ContainerLeaseAdapter(doc),
      context
    );

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
   * @param {Context} context
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @returns {Promise<GetContainerAccessPolicyResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async getContainerACL(
    context: Context,
    account: string,
    container: string,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<GetContainerAccessPolicyResponse> {
    const doc = await this.getContainerWithLeaseUpdated(
      account,
      container,
      context
    );

    new ContainerReadLeaseValidator(leaseAccessConditions).validate(
      new ContainerLeaseAdapter(doc),
      context
    );

    const res: GetContainerAccessPolicyResponse = {
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
   * @param {SetContainerAccessPolicyOptions} setAclModel
   * @param {Context} context
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async setContainerACL(
    context: Context,
    account: string,
    container: string,
    setAclModel: SetContainerAccessPolicyOptions
  ): Promise<void> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainerWithLeaseUpdated(
      account,
      container,
      context
    );

    new ContainerReadLeaseValidator(setAclModel.leaseAccessConditions).validate(
      new ContainerLeaseAdapter(doc),
      context
    );

    doc.properties.publicAccess = setAclModel.publicAccess;
    doc.containerAcl = setAclModel.containerAcl;
    doc.properties.lastModified = setAclModel.lastModified;
    doc.properties.etag = setAclModel.etag;

    return coll.update(doc);
  }

  /**
   * Acquire container lease.
   *
   * @param {string} account
   * @param {string} container
   * @param {Models.ContainerAcquireLeaseOptionalParams} options
   * @param {Context} context
   * @returns {Promise<AcquireContainerLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async acquireContainerLease(
    context: Context,
    account: string,
    container: string,
    options: Models.ContainerAcquireLeaseOptionalParams
  ): Promise<AcquireContainerLeaseResponse> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainer(account, container, context);

    LeaseFactory.createLeaseState(new ContainerLeaseAdapter(doc), context)
      .acquire(options.duration!, options.proposedLeaseId)
      .sync(new ContainerLeaseSyncer(doc));

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Release container lease.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {Context} context
   * @returns {Promise<ReleaseContainerLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async releaseContainerLease(
    context: Context,
    account: string,
    container: string,
    leaseId: string
  ): Promise<ReleaseContainerLeaseResponse> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainer(account, container, context);

    LeaseFactory.createLeaseState(new ContainerLeaseAdapter(doc), context)
      .release(leaseId)
      .sync(new ContainerLeaseSyncer(doc));

    coll.update(doc);

    return doc.properties;
  }

  /**
   * Renew container lease.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {Context} context
   * @returns {Promise<RenewContainerLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async renewContainerLease(
    context: Context,
    account: string,
    container: string,
    leaseId: string
  ): Promise<RenewContainerLeaseResponse> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainer(account, container, context);

    LeaseFactory.createLeaseState(new ContainerLeaseAdapter(doc), context)
      .renew(leaseId)
      .sync(new ContainerLeaseSyncer(doc));

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Break container lease.
   *
   * @param {string} account
   * @param {string} container
   * @param {(number | undefined)} breakPeriod
   * @param {Context} context
   * @returns {Promise<BreakContainerLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async breakContainerLease(
    context: Context,
    account: string,
    container: string,
    breakPeriod: number | undefined
  ): Promise<BreakContainerLeaseResponse> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainer(account, container, context);

    LeaseFactory.createLeaseState(new ContainerLeaseAdapter(doc), context)
      .break(breakPeriod)
      .sync(new ContainerLeaseSyncer(doc));

    const leaseTimeSeconds: number =
      doc.properties.leaseState === Models.LeaseStateType.Breaking &&
      doc.leaseBreakTime
        ? Math.round(
            (doc.leaseBreakTime.getTime() - context.startTime!.getTime()) / 1000
          )
        : 0;

    coll.update(doc);

    return { properties: doc.properties, leaseTime: leaseTimeSeconds };
  }

  /**
   * Change container lease.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @param {Context} context
   * @returns {Promise<ChangeContainerLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async changeContainerLease(
    context: Context,
    account: string,
    container: string,
    leaseId: string,
    proposedLeaseId: string
  ): Promise<ChangeContainerLeaseResponse> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = await this.getContainer(account, container, context);

    LeaseFactory.createLeaseState(new ContainerLeaseAdapter(doc), context)
      .change(leaseId, proposedLeaseId)
      .sync(new ContainerLeaseSyncer(doc));

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
    context: Context,
    account: string,
    container: string
  ): Promise<void> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: container });
    if (!doc) {
      const requestId = context ? context.contextId : undefined;
      throw StorageErrorFactory.getContainerNotFound(requestId);
    }
  }

  public async listBlobs(
    context: Context,
    account: string,
    container: string,
    blob?: string,
    prefix: string = "",
    maxResults: number = DEFAULT_LIST_BLOBS_MAX_RESULTS,
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
      return [
        docs.map(doc => {
          return LeaseFactory.createLeaseState(
            new BlobLeaseAdapter(doc),
            context
          ).sync(new BlobLeaseSyncer(doc));
        }),
        undefined
      ];
    } else {
      const nextMarker = docs[docs.length - 2].name;
      docs.pop();
      return [
        docs.map(doc => {
          return LeaseFactory.createLeaseState(
            new BlobLeaseAdapter(doc),
            context
          ).sync(new BlobLeaseSyncer(doc));
        }),
        nextMarker
      ];
    }
  }

  public async listAllBlobs(
    maxResults: number = DEFAULT_LIST_BLOBS_MAX_RESULTS,
    marker: string = "",
    includeSnapshots?: boolean
  ): Promise<[BlobModel[], string | undefined]> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);

    let docs;
    if (includeSnapshots === true) {
      docs = await coll
        .chain()
        .where(obj => {
          return obj.name > marker!;
        })
        .simplesort("name")
        .limit(maxResults + 1)
        .data();
    } else {
      docs = await coll
        .chain()
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
   * @param {Context} context
   * @param {BlobModel} blob
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async createBlob(
    context: Context,
    blob: BlobModel,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<void> {
    await this.checkContainerExist(
      context,
      blob.accountName,
      blob.containerName
    );
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const blobDoc = coll.findOne({
      accountName: blob.accountName,
      containerName: blob.containerName,
      name: blob.name,
      snapshot: blob.snapshot
    });

    if (blobDoc) {
      LeaseFactory.createLeaseState(
        new BlobLeaseAdapter(blobDoc),
        context
      ).validate(new BlobWriteLeaseValidator(leaseAccessConditions));

      if (
        blobDoc.properties !== undefined &&
        blobDoc.properties.accessTier === Models.AccessTier.Archive
      ) {
        throw StorageErrorFactory.getBlobArchived(context.contextId);
      }
      coll.remove(blobDoc);
    }
    delete (blob as any).$loki;
    return coll.insert(blob);
  }

  /**
   * Create snapshot.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions] Optional. Will validate lease if provided
   * @returns {Promise<CreateSnapshotResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async createSnapshot(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions?: Models.LeaseAccessConditions,
    metadata?: Models.BlobMetadata
  ): Promise<CreateSnapshotResponse> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    new BlobReadLeaseValidator(leaseAccessConditions).validate(
      new BlobLeaseAdapter(doc),
      context
    );

    const snapshotBlob: BlobModel = {
      name: doc.name,
      deleted: false,
      snapshot: convertDateTimeStringMsTo7Digital(
        context.startTime!.toISOString()
      ),
      properties: { ...doc.properties },
      metadata: metadata ? { ...metadata } : { ...doc.metadata },
      accountName: doc.accountName,
      containerName: doc.containerName,
      pageRangesInOrder:
        doc.pageRangesInOrder === undefined
          ? undefined
          : doc.pageRangesInOrder.slice(),
      isCommitted: doc.isCommitted,
      committedBlocksInOrder:
        doc.committedBlocksInOrder === undefined
          ? undefined
          : doc.committedBlocksInOrder.slice(),
      persistency:
        doc.persistency === undefined ? undefined : { ...doc.persistency }
    };

    new BlobLeaseSyncer(snapshotBlob).sync({
      leaseId: undefined,
      leaseExpireTime: undefined,
      leaseDurationSeconds: undefined,
      leaseBreakTime: undefined,
      leaseDurationType: undefined,
      leaseState: undefined,
      leaseStatus: undefined
    });

    coll.insert(snapshotBlob);

    return {
      properties: snapshotBlob.properties,
      snapshot: snapshotBlob.snapshot
    };
  }

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   * Will return block list or page list as well for downloading.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot=""]
   * @param {Models.LeaseAccessConditions} [leaseAccessConditions]
   * @returns {Promise<BlobModel>}
   * @memberof LokiBlobMetadataStore
   */
  public async downloadBlob(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<BlobModel> {
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      snapshot,
      context
    );

    new BlobReadLeaseValidator(leaseAccessConditions).validate(
      new BlobLeaseAdapter(doc),
      context
    );

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
    context: Context,
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
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot=""]
   * @returns {Promise<GetBlobPropertiesRes>}
   * @memberof LokiBlobMetadataStore
   */
  public async getBlobProperties(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    leaseAccessConditions: Models.LeaseAccessConditions | undefined
  ): Promise<GetBlobPropertiesRes> {
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      snapshot,
      context
    );

    new BlobReadLeaseValidator(leaseAccessConditions).validate(
      new BlobLeaseAdapter(doc),
      context
    );

    return { properties: doc.properties, metadata: doc.metadata };
  }

  /**
   * Delete blob or its snapshots.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.BlobDeleteMethodOptionalParams} options
   * @returns {Promise<void>}
   * @memberof LokiBlobMetadataStore
   */
  public async deleteBlob(
    context: Context,
    account: string,
    container: string,
    blob: string,
    options: Models.BlobDeleteMethodOptionalParams
  ): Promise<void> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    await this.checkContainerExist(context, account, container);

    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      options.snapshot,
      context
    );
    const againstBaseBlob = doc.snapshot === "";

    // Check bad requests
    if (!againstBaseBlob && options.deleteSnapshots !== undefined) {
      throw StorageErrorFactory.getInvalidOperation(
        context.contextId!,
        "Invalid operation against a blob snapshot."
      );
    }

    new BlobWriteLeaseValidator(options.leaseAccessConditions).validate(
      new BlobLeaseAdapter(doc),
      context
    );

    // Scenario: Delete base blob only
    if (againstBaseBlob && options.deleteSnapshots === undefined) {
      const count = coll.count({
        accountName: account,
        containerName: container,
        blobName: blob
      });
      if (count > 1) {
        throw StorageErrorFactory.getSnapshotsPresent(context.contextId!);
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
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(string | undefined)} snapshot
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {(Models.BlobHTTPHeaders | undefined)} blobHTTPHeaders
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async setBlobHTTPHeaders(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    blobHTTPHeaders: Models.BlobHTTPHeaders | undefined
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    const lease = new BlobLeaseAdapter(doc);
    new BlobWriteLeaseValidator(leaseAccessConditions).validate(lease, context);

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
    doc.properties.etag = newEtag();

    new BlobWriteLeaseSyncer(doc).sync(lease);

    coll.update(doc);
    return doc.properties;
  }

  /**
   * Set blob metadata.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async setBlobMetadata(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined,
    metadata: Models.BlobMetadata | undefined
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    const lease = new BlobLeaseAdapter(doc);
    new BlobWriteLeaseValidator(leaseAccessConditions).validate(lease, context);
    new BlobWriteLeaseSyncer(doc).sync(lease);
    doc.metadata = metadata;
    doc.properties.etag = newEtag();
    coll.update(doc);
    return doc.properties;
  }

  /**
   * Acquire blob lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {number} duration
   * @param {string} [proposedLeaseId]
   * @returns {Promise<AcquireBlobLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async acquireBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    duration: number,
    proposedLeaseId?: string
  ): Promise<AcquireBlobLeaseResponse> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextId!);
    }

    LeaseFactory.createLeaseState(new BlobLeaseAdapter(doc), context)
      .acquire(duration, proposedLeaseId)
      .sync(new BlobLeaseSyncer(doc));

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Release blob.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @returns {Promise<ReleaseBlobLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async releaseBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseId: string
  ): Promise<ReleaseBlobLeaseResponse> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextId!);
    }

    LeaseFactory.createLeaseState(new BlobLeaseAdapter(doc), context)
      .release(leaseId)
      .sync(new BlobLeaseSyncer(doc));

    coll.update(doc);

    return doc.properties;
  }

  /**
   * Renew blob lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @returns {Promise<RenewBlobLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async renewBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseId: string
  ): Promise<RenewBlobLeaseResponse> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextId!);
    }

    LeaseFactory.createLeaseState(new BlobLeaseAdapter(doc), context)
      .renew(leaseId)
      .sync(new BlobLeaseSyncer(doc));

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Change blob lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} leaseId
   * @param {string} proposedLeaseId
   * @returns {Promise<ChangeBlobLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async changeBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    leaseId: string,
    proposedLeaseId: string
  ): Promise<ChangeBlobLeaseResponse> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextId!);
    }

    LeaseFactory.createLeaseState(new BlobLeaseAdapter(doc), context)
      .change(leaseId, proposedLeaseId)
      .sync(new BlobLeaseSyncer(doc));

    coll.update(doc);

    return { properties: doc.properties, leaseId: doc.leaseId };
  }

  /**
   * Break blob lease.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {(number | undefined)} breakPeriod
   * @returns {Promise<BreakBlobLeaseResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async breakBlobLease(
    context: Context,
    account: string,
    container: string,
    blob: string,
    breakPeriod: number | undefined
  ): Promise<BreakBlobLeaseResponse> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextId!);
    }

    LeaseFactory.createLeaseState(new BlobLeaseAdapter(doc), context)
      .break(breakPeriod)
      .sync(new BlobLeaseSyncer(doc));

    const leaseTimeSeconds: number =
      doc.properties.leaseState === Models.LeaseStateType.Breaking &&
      doc.leaseBreakTime
        ? Math.round(
            (doc.leaseBreakTime.getTime() - context.startTime!.getTime()) / 1000
          )
        : 0;

    coll.update(doc);

    return { properties: doc.properties, leaseTime: leaseTimeSeconds };
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
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot: string = ""
  ): Promise<void> {
    await this.checkContainerExist(context, account, container);

    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob,
      snapshot
    });

    if (!doc) {
      const requestId = context ? context.contextId : undefined;
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
   * @param {Context} context
   * @param {BlobId} source
   * @param {BlobId} destination
   * @param {(Models.BlobMetadata | undefined)} metadata
   * @param {(Models.AccessTier | undefined)} tier
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async startCopyFromURL(
    context: Context,
    source: BlobId,
    destination: BlobId,
    copySource: string,
    metadata: Models.BlobMetadata | undefined,
    tier: Models.AccessTier | undefined,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const sourceBlob = await this.getBlobWithLeaseUpdated(
      source.account,
      source.container,
      source.blob,
      source.snapshot,
      context
    );

    const destBlob = await this.getBlobWithLeaseUpdated(
      destination.account,
      destination.container,
      destination.blob,
      undefined,
      context,
      false
    );

    if (destBlob) {
      new BlobWriteLeaseValidator(leaseAccessConditions).validate(
        new BlobLeaseAdapter(destBlob),
        context
      );
    }

    // If source is uncommitted or deleted
    if (
      sourceBlob === undefined ||
      sourceBlob.deleted ||
      !sourceBlob.isCommitted
    ) {
      throw StorageErrorFactory.getBlobNotFound(context.contextId!);
    }

    if (sourceBlob.properties.accessTier === Models.AccessTier.Archive) {
      throw StorageErrorFactory.getBlobArchived(context.contextId!);
    }

    await this.checkContainerExist(
      context,
      destination.account,
      destination.container
    );

    // Deep clone a copied blob
    const copiedBlob: BlobModel = {
      name: destination.blob,
      deleted: false,
      snapshot: "",
      properties: {
        ...sourceBlob.properties,
        creationTime: context.startTime!,
        lastModified: context.startTime!,
        etag: newEtag(),
        leaseStatus:
          destBlob !== undefined
            ? destBlob.properties.leaseStatus
            : Models.LeaseStatusType.Unlocked,
        leaseState:
          destBlob !== undefined
            ? destBlob.properties.leaseState
            : Models.LeaseStateType.Available,
        leaseDuration:
          destBlob !== undefined
            ? destBlob.properties.leaseDuration
            : undefined,
        copyId: uuid(),
        copyStatus: Models.CopyStatusType.Success,
        copySource,
        copyProgress: sourceBlob.properties.contentLength
          ? `${sourceBlob.properties.contentLength}/${sourceBlob.properties.contentLength}`
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
          ? { ...sourceBlob.metadata }
          : metadata,
      accountName: destination.account,
      containerName: destination.container,
      pageRangesInOrder: sourceBlob.pageRangesInOrder,
      isCommitted: sourceBlob.isCommitted,
      leaseDurationSeconds:
        destBlob !== undefined ? destBlob.leaseDurationSeconds : undefined,
      leaseId: destBlob !== undefined ? destBlob.leaseId : undefined,
      leaseExpireTime:
        destBlob !== undefined ? destBlob.leaseExpireTime : undefined,
      leaseBreakTime:
        destBlob !== undefined ? destBlob.leaseBreakTime : undefined,
      committedBlocksInOrder: sourceBlob.committedBlocksInOrder,
      persistency: sourceBlob.persistency
    };

    if (
      copiedBlob.properties.blobType === Models.BlobType.BlockBlob &&
      tier !== undefined
    ) {
      copiedBlob.properties.accessTier = this.parseTier(tier);
      if (copiedBlob.properties.accessTier === undefined) {
        throw StorageErrorFactory.getInvalidHeaderValue(context.contextId, {
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
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.AccessTier} tier
   * @param {(Models.LeaseAccessConditions | undefined)} leaseAccessConditions
   * @returns {(Promise<200 | 202>)}
   * @memberof LokiBlobMetadataStore
   */
  public async setTier(
    context: Context,
    account: string,
    container: string,
    blob: string,
    tier: Models.AccessTier,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined
  ): Promise<200 | 202> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );
    let responseCode: 200 | 202 = 200;

    // Check the lease action aligned with current lease state.
    // API reference doesn't mention there is x-ms-lease-id header supported by this API,
    // however, it fails to set tier for a leased blocked blob with LeaseIdMissing
    const lease = new BlobLeaseAdapter(doc);
    new BlobWriteLeaseValidator(leaseAccessConditions).validate(lease, context);

    // Check Blob is not snapshot
    if (doc.snapshot !== "") {
      throw StorageErrorFactory.getBlobSnapshotsPresent(context.contextId!);
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
      throw StorageErrorFactory.getBlobInvalidBlobType(context.contextId!);
    }

    new BlobWriteLeaseSyncer(doc).sync(lease);
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
  public async stageBlock(
    context: Context,
    block: BlockModel,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<void> {
    await this.checkContainerExist(
      context,
      block.accountName,
      block.containerName
    );

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
          contentLength: 0,
          blobType: Models.BlobType.BlockBlob
        },
        snapshot: "",
        isCommitted: false
      };
      blobColl.insert(newBlob);
    } else {
      LeaseFactory.createLeaseState(new BlobLeaseAdapter(blobDoc), context)
        .validate(new BlobWriteLeaseValidator(leaseAccessConditions))
        .sync(new BlobWriteLeaseSyncer(blobDoc));
    }

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
    context: Context,
    blob: BlobModel,
    blockList: { blockName: string; blockCommitType: string }[],
    leaseAccessConditions: Models.LeaseAccessConditions | undefined
  ): Promise<void> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      blob.accountName,
      blob.containerName,
      blob.name,
      blob.snapshot,
      context,
      // XStore allows commit block list with empty block list to create a block blob without stage block call
      // In this case, there will no existing blob doc exists
      false
    );

    let lease: ILease | undefined;
    if (doc) {
      lease = new BlobLeaseAdapter(doc);
      new BlobWriteLeaseValidator(leaseAccessConditions).validate(
        lease,
        context
      );
    }

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
    if (doc) {
      for (const pBlock of doc.committedBlocksInOrder || []) {
        pCommittedBlocksMap.set(pBlock.name, pBlock);
      }
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
            throw StorageErrorFactory.getInvalidBlockList(context.contextId!);
          } else {
            selectedBlockList.push(pUncommittedBlock);
          }
          break;
        case "committed":
          const pCommittedBlock = pCommittedBlocksMap.get(block_1.blockName);
          if (pCommittedBlock === undefined) {
            throw StorageErrorFactory.getInvalidBlockList(context.contextId!);
          } else {
            selectedBlockList.push(pCommittedBlock);
          }
          break;
        case "latest":
          const pLatestBlock =
            pUncommittedBlocksMap.get(block_1.blockName) ||
            pCommittedBlocksMap.get(block_1.blockName);
          if (pLatestBlock === undefined) {
            throw StorageErrorFactory.getInvalidBlockList(context.contextId!);
          } else {
            selectedBlockList.push(pLatestBlock);
          }
          break;
        default:
          throw StorageErrorFactory.getInvalidBlockList(context.contextId!);
      }
    }

    if (doc) {
      // Commit block list
      doc.properties.blobType = blob.properties.blobType;
      doc.committedBlocksInOrder = selectedBlockList;
      doc.isCommitted = true;
      doc.metadata = blob.metadata;
      doc.properties.accessTier = blob.properties.accessTier;
      doc.properties.accessTierInferred = blob.properties.accessTierInferred;
      doc.properties.etag = blob.properties.etag;
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
        }, 0);

      // set lease state to available if it's expired
      if (lease) {
        new BlobWriteLeaseSyncer(doc).sync(lease);
      }

      coll.update(doc);
    } else {
      blob.committedBlocksInOrder = selectedBlockList;
      blob.properties.contentLength = selectedBlockList
        .map(block => block.size)
        .reduce((total, val) => {
          return total + val;
        }, 0);
      coll.insert(blob);
    }

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
    context: Context,
    account: string,
    container: string,
    blob: string,
    isCommitted: boolean | undefined,
    leaseAccessConditions: Models.LeaseAccessConditions | undefined
  ): Promise<{
    properties: Models.BlobProperties;
    uncommittedBlocks: Models.Block[];
    committedBlocks: Models.Block[];
  }> {
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    new BlobReadLeaseValidator(leaseAccessConditions).validate(
      new BlobLeaseAdapter(doc),
      context
    );

    const res: {
      properties: Models.BlobProperties;
      uncommittedBlocks: Models.Block[];
      committedBlocks: Models.Block[];
    } = {
      properties: doc.properties,
      uncommittedBlocks: [],
      committedBlocks: []
    };

    if (isCommitted !== false && doc.committedBlocksInOrder !== undefined) {
      res.committedBlocks = doc.committedBlocksInOrder;
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
   * Upload new pages for page blob.
   *
   * @param {BlobModel} blob
   * @param {number} start
   * @param {number} end
   * @param {IExtentChunk} persistency
   * @param {Context} [context]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async uploadPages(
    context: Context,
    blob: BlobModel,
    start: number,
    end: number,
    persistency: IExtentChunk,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      blob.accountName,
      blob.containerName,
      blob.name,
      blob.snapshot,
      context!
    );

    const lease = new BlobLeaseAdapter(doc);
    new BlobWriteLeaseValidator(leaseAccessConditions).validate(lease, context);

    this.pageBlobRangesManager.mergeRange(doc.pageRangesInOrder || [], {
      start,
      end,
      persistency
    });

    // set lease state to available if it's expired
    new BlobWriteLeaseSyncer(doc).sync(lease);

    doc.properties.etag = newEtag();

    coll.update(doc);

    return doc.properties;
  }

  /**
   * Clear range for a page blob.
   *
   * @param {BlobModel} blob
   * @param {number} start
   * @param {number} end
   * @param {Context} [context]
   * @returns {Promise<Models.BlobProperties>}
   * @memberof LokiBlobMetadataStore
   */
  public async clearRange(
    context: Context,
    blob: BlobModel,
    start: number,
    end: number,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      blob.accountName,
      blob.containerName,
      blob.name,
      blob.snapshot,
      context!
    );

    const lease = new BlobLeaseAdapter(doc);
    new BlobWriteLeaseValidator(leaseAccessConditions).validate(lease, context);

    this.pageBlobRangesManager.clearRange(doc.pageRangesInOrder || [], {
      start,
      end
    });

    // TODO: Check other blob update operations need lease reset or not
    // set lease state to available if it's expired
    new BlobWriteLeaseSyncer(doc).sync(lease);

    doc.properties.etag = newEtag();
    coll.update(doc);

    return doc.properties;
  }

  /**
   * Returns the list of valid page ranges for a page blob or snapshot of a page blob.
   *
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @returns {Promise<GetPageRangeResponse>}
   * @memberof LokiBlobMetadataStore
   */
  public async getPageRanges(
    context: Context,
    account: string,
    container: string,
    blob: string,
    snapshot?: string,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<GetPageRangeResponse> {
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      snapshot,
      context
    );

    new BlobReadLeaseValidator(leaseAccessConditions).validate(
      new BlobLeaseAdapter(doc),
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
    context: Context,
    account: string,
    container: string,
    blob: string,
    blobContentLength: number,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );
    const requestId = context ? context.contextId : undefined;

    if (doc.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getInvalidOperation(
        requestId,
        "Resize could only be against a page blob."
      );
    }

    const lease = new BlobLeaseAdapter(doc);
    new BlobWriteLeaseValidator(leaseAccessConditions).validate(lease, context);

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

    new BlobWriteLeaseSyncer(doc).sync(lease);

    coll.update(doc);
    return doc.properties;
  }

  /**
   * Update the sequence number of a page blob.
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
    context: Context,
    account: string,
    container: string,
    blob: string,
    sequenceNumberAction: Models.SequenceNumberActionType,
    blobSequenceNumber: number | undefined,
    leaseAccessConditions?: Models.LeaseAccessConditions
  ): Promise<Models.BlobProperties> {
    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = await this.getBlobWithLeaseUpdated(
      account,
      container,
      blob,
      undefined,
      context
    );

    if (doc.properties.blobType !== Models.BlobType.PageBlob) {
      throw StorageErrorFactory.getInvalidOperation(
        context.contextId!,
        "Get Page Ranges could only be against a page blob."
      );
    }

    const lease = new BlobLeaseAdapter(doc);
    new BlobWriteLeaseValidator(leaseAccessConditions).validate(lease, context);

    if (doc.properties.blobSequenceNumber === undefined) {
      doc.properties.blobSequenceNumber = 0;
    }

    switch (sequenceNumberAction) {
      case Models.SequenceNumberActionType.Max:
        if (blobSequenceNumber === undefined) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextId!,
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
            context.contextId!,
            "x-ms-blob-sequence-number cannot be provided when x-ms-sequence-number-action is set to increment."
          );
        }
        doc.properties.blobSequenceNumber++;
        break;
      case Models.SequenceNumberActionType.Update:
        if (blobSequenceNumber === undefined) {
          throw StorageErrorFactory.getInvalidOperation(
            context.contextId!,
            "x-ms-blob-sequence-number is required when x-ms-sequence-number-action is set to update."
          );
        }
        doc.properties.blobSequenceNumber = blobSequenceNumber;
        break;
      default:
        throw StorageErrorFactory.getInvalidOperation(
          context.contextId!,
          "Unsupported x-ms-sequence-number-action value."
        );
    }

    doc.properties.etag = newEtag();
    new BlobWriteLeaseSyncer(doc).sync(lease);

    coll.update(doc);
    return doc.properties;
  }

  public async listUncommittedBlockPersistencyChunks(
    marker: string = "-1",
    maxResults: number = 2000
  ): Promise<[IExtentChunk[], string | undefined]> {
    const coll = this.db.getCollection(this.BLOCKS_COLLECTION);
    const blockDocs = coll
      .chain()
      .where(obj => {
        return obj.$loki > parseInt(marker, 10);
      })
      .simplesort("$loki")
      .limit(maxResults + 1)
      .data();

    if (blockDocs.length <= maxResults) {
      return [blockDocs.map(block => block.persistency), undefined];
    } else {
      blockDocs.pop();
      const nextMarker = `${blockDocs[maxResults - 1].$loki}`;
      return [blockDocs.map(block => block.persistency), nextMarker];
    }
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
   * Get a container document from container collection.
   * Updated lease related properties according to current time.
   *
   * @private
   * @param {string} account
   * @param {string} container
   * @param {Context} context
   * @returns {Promise<ContainerModel>}
   * @memberof LokiBlobMetadataStore
   */
  private async getContainerWithLeaseUpdated(
    account: string,
    container: string,
    context: Context
  ): Promise<ContainerModel> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: container });
    if (!doc) {
      throw StorageErrorFactory.getContainerNotFound(context.contextId);
    }

    LeaseFactory.createLeaseState(new ContainerLeaseAdapter(doc), context).sync(
      new ContainerLeaseSyncer(doc)
    );

    return doc;
  }

  /**
   * Get a container document from collections.
   *
   * @param {string} account
   * @param {string} container
   * @param {Context} context
   * @returns {Promise<ContainerModel>}
   * @memberof LokiBlobMetadataStore
   */
  private async getContainer(
    account: string,
    container: string,
    context: Context
  ): Promise<ContainerModel> {
    const coll = this.db.getCollection(this.CONTAINERS_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: container });
    if (!doc) {
      const requestId = context ? context.contextId : undefined;
      throw StorageErrorFactory.getContainerNotFound(requestId);
    }

    return doc;
  }

  /**
   * Get a blob doc from collections.
   *
   * @private
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} snapshot
   * @param {Context} context
   * @returns {Promise<BlobModel>}
   * @memberof LokiBlobMetadataStore
   */
  private async getBlobWithLeaseUpdated(
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    context: Context
  ): Promise<BlobModel>;
  private async getBlobWithLeaseUpdated(
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    context: Context,
    // tslint:disable-next-line:unified-signatures
    forceExist: true
  ): Promise<BlobModel>;
  private async getBlobWithLeaseUpdated(
    account: string,
    container: string,
    blob: string,
    snapshot: string | undefined,
    context: Context,
    forceExist: false
  ): Promise<BlobModel | undefined>;
  private async getBlobWithLeaseUpdated(
    account: string,
    container: string,
    blob: string,
    snapshot: string = "",
    context: Context,
    forceExist?: boolean
  ): Promise<BlobModel | undefined> {
    await this.checkContainerExist(context, account, container);

    const coll = this.db.getCollection(this.BLOBS_COLLECTION);
    const doc = coll.findOne({
      accountName: account,
      containerName: container,
      name: blob,
      snapshot
    });

    if (forceExist === undefined || forceExist === true) {
      if (!doc) {
        throw StorageErrorFactory.getBlobNotFound(context.contextId);
      }
    }

    if (!doc) {
      return undefined;
    }

    if (doc.properties) {
      doc.properties.contentMD5 = this.restoreUint8Array(
        doc.properties.contentMD5
      );
    }

    // Snapshot doesn't have lease
    if (snapshot !== undefined && snapshot !== "") {
      new BlobLeaseSyncer(doc).sync({
        leaseId: undefined,
        leaseExpireTime: undefined,
        leaseDurationSeconds: undefined,
        leaseBreakTime: undefined,
        leaseDurationType: undefined,
        leaseState: Models.LeaseStateType.Available, // TODO: Lease state & status should be undefined for snapshots
        leaseStatus: LeaseStatusType.Unlocked // TODO: Lease state & status should be undefined for snapshots
      });
    } else {
      LeaseFactory.createLeaseState(new BlobLeaseAdapter(doc), context).sync(
        new BlobLeaseSyncer(doc)
      );
    }

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
