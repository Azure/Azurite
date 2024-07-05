import { stat } from "fs";
import Loki from "lokijs";

import StorageErrorFactory from "../errors/StorageErrorFactory";
import Context from "../generated/Context";
import { QUEUE_STATUSCODE } from "../utils/constants";
import {
  IQueueMetadata,
  IQueueMetadataStore,
  MessageModel,
  MessageUpdateProperties,
  QueueACL,
  QueueModel,
  ServicePropertiesModel
} from "./IQueueMetadataStore";
import QueueReferredExtentsAsyncIterator from "./QueueReferredExtentsAsyncIterator";
import { rimrafAsync } from "../../common/utils/utils";

/**
 * This is a metadata source implementation for queue based on loki DB.
 *
 * Notice that, following design is for emulator purpose only, and doesn't design for best performance.
 * We may want to optimize the persistency layer performance in the future. Such as by distributing metadata
 * into different collections, or make binary payload write as an append-only pattern.
 *
 * Loki DB includes following collections and documents:
 *
 * -- SERVICE_PROPERTIES_COLLECTION // Collection contains service properties
 *                                  // Default collection name is $SERVICES_COLLECTION$
 *                                  // Each document maps to 1 account queue service
 *                                  // Unique document properties: accountName
 * -- QUEUES_COLLECTION  // Collection contains all queues
 *                           // Default collection name is $QUEUES_COLLECTION$
 *                           // Each document maps to 1 queue
 *                           // Unique document properties: accountName, (queue)name
 * -- MESSAGES_COLLECTION    // Collection contains all messages
 *                           // Default collection name is $MESSAGES_COLLECTION$
 *                           // Each document maps to a message
 *                           // Unique document properties: accountName, queueName, messageId
 *
 * @export
 * @class LokiQueueMetadataStore
 */
export default class LokiQueueMetadataStore implements IQueueMetadataStore {
  private readonly db: Loki;

  private initialized: boolean = false;
  private closed: boolean = false;

  private readonly SERVICES_COLLECTION = "$SERVICES_COLLECTION$";
  private readonly QUEUES_COLLECTION = "$QUEUES_COLLECTION$";
  private readonly MESSAGES_COLLECTION = "$MESSAGES_COLLECTION$";

  public constructor(public readonly lokiDBPath: string, inMemory: boolean) {
    this.db = new Loki(lokiDBPath, inMemory ? {
      persistenceMethod: "memory"
    } : {
      persistenceMethod: "fs",
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
          this.db.loadDatabase({}, (dbError) => {
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

    // Create queues collection if not exists
    if (this.db.getCollection(this.QUEUES_COLLECTION) === null) {
      this.db.addCollection(this.QUEUES_COLLECTION, {
        // Optimization for indexing and searching
        // https://rawgit.com/techfort/LokiJS/master/jsdoc/tutorial-Indexing%20and%20Query%20performance.html
        indices: ["accountName", "name"]
      }); // Optimize for find operation
    }

    // Create messages collection if not exists
    if (this.db.getCollection(this.MESSAGES_COLLECTION) === null) {
      this.db.addCollection(this.MESSAGES_COLLECTION, {
        indices: ["accountName", "queueName", "messageId", "visibleTime"] // Optimize for find operation
      });
    }

    await new Promise<void>((resolve, reject) => {
      this.db.saveDatabase((err) => {
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
   * @memberof LokiQueueDataStore
   */
  public async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.close((err) => {
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
   * Clean LokiQueueMetadataStore.
   *
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  public async clean(): Promise<void> {
    if (this.isClosed()) {
      await rimrafAsync(this.lokiDBPath);

      return;
    }
    throw new Error(`Cannot clean LokiQueueMetadataStore, it's not closed.`);
  }

  /**
   * Update queue service properties. Create service properties document if not exists in persistency layer.
   * Assume service properties collection has been created during start method.
   *
   * @param {ServicePropertiesModel} updateProperties
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  public async updateServiceProperties(
    updateProperties: ServicePropertiesModel
  ): Promise<void> {
    const coll = this.db.getCollection(this.SERVICES_COLLECTION);
    const doc = coll.by("accountName", updateProperties.accountName);
    if (doc) {
      doc.cors =
        updateProperties.cors === undefined ? doc.cors : updateProperties.cors;
      doc.hourMetrics =
        updateProperties.hourMetrics === undefined
          ? doc.hourMetrics
          : updateProperties.hourMetrics;
      doc.logging =
        updateProperties.logging === undefined
          ? doc.logging
          : updateProperties.logging;
      doc.minuteMetrics =
        updateProperties.minuteMetrics === undefined
          ? doc.minuteMetrics
          : updateProperties.minuteMetrics;

      coll.update(doc);
    } else {
      coll.insert(updateProperties);
    }
  }

  /**
   * Get service properties for specific storage account.
   *
   * @template T
   * @param {string} account
   * @returns {(Promise<ServicePropertiesModel | undefined>)}
   * @memberof LokiQueueMetadataStore
   */
  public async getServiceProperties(
    account: string
  ): Promise<ServicePropertiesModel | undefined> {
    const coll = this.db.getCollection(this.SERVICES_COLLECTION);
    const doc = coll.by("accountName", account);
    return doc ? doc : undefined;
  }

  /**
   * List queues with query conditions specified.
   *
   * @template T
   * @param {string} account
   * @param {string} [prefix=""]
   * @param {number} [maxResults=5000]
   * @param {number} [marker=0]
   * @returns {(Promise<[QueueModel[], number | undefined]>)} A tuple including queues and next marker
   * @memberof LokiQueueMetadataStore
   */
  public async listQueues(
    account: string,
    prefix: string = "",
    maxResults: number = 5000,
    marker: number = 0
  ): Promise<[QueueModel[], number | undefined]> {
    const coll = this.db.getCollection(this.QUEUES_COLLECTION);

    const query =
      prefix === ""
        ? { $loki: { $gt: marker }, accountName: account }
        : {
            name: { $regex: `^${this.escapeRegex(prefix)}` },
            $loki: { $gt: marker },
            accountName: account
          };

    // Get one more item to help check if the query reach the tail of the collection.
    const docs = coll
      .chain()
      .find(query)
      .sort((obj1, obj2) => {
        if (obj1.name === obj2.name) return 0;
        if (obj1.name > obj2.name) return 1;
        return -1;
      })
      .limit(maxResults + 1)
      .data();

    const queues = [];

    for (let i = 0; i < maxResults && i < docs.length; i++) {
      queues.push(this.queueCopy(docs[i]));
    }

    if (docs.length <= maxResults) {
      return [queues, undefined];
    } else {
      // In this case, the last item is the one we get in addition, should set the Marker before it.
      const nextMarker = docs[docs.length - 1].$loki - 1;
      return [queues, nextMarker];
    }
  }

  /**
   * Get a queue item from persistency layer by account and queue name.
   *
   * @param {string} account
   * @param {string} queue
   * @param {Context} [context]
   * @returns {Promise<QueueModel>}
   * @memberof LokiQueueMetadataStore
   */
  public async getQueue(
    account: string,
    queue: string,
    context?: Context
  ): Promise<QueueModel> {
    const coll = this.db.getCollection(this.QUEUES_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: queue });
    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getQueueNotFound(requestId);
    }
    return doc;
  }

  /**
   * Create a queue in persistency layer.
   * Return 201 if create a new one, 204 if a same one exist, 409 error if a conflicting one exist.
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/create-queue4
   *
   * @param {QueueModel} queue
   * @param {Context} [context]
   * @returns {Promise<QUEUE_STATUSCODE>}
   * @memberof LokiQueueMetadataStore
   */
  public async createQueue(
    queue: QueueModel,
    context?: Context
  ): Promise<QUEUE_STATUSCODE> {
    const coll = this.db.getCollection(this.QUEUES_COLLECTION);
    const doc = coll.findOne({
      accountName: queue.accountName,
      name: queue.name
    });

    // Check whether a conflict exists if there exist a queue with the given name.
    // If the exist queue has the same metadata as the given queue, then return 204, else throw 409 error.
    if (doc) {
      const docMeta = doc.metadata;
      const queueMeta = queue.metadata;

      // Check if both metadata is empty.
      if (queueMeta === undefined) {
        if (docMeta !== undefined) {
          throw StorageErrorFactory.getQueueAlreadyExists(
            context ? context.contextID : undefined
          );
        } else {
          return 204;
        }
      }

      if (docMeta === undefined) {
        throw StorageErrorFactory.getQueueAlreadyExists(
          context ? context.contextID : undefined
        );
      }

      // Check if the numbers of metadata are equal.
      if (Object.keys(queueMeta).length !== Object.keys(docMeta).length) {
        throw StorageErrorFactory.getQueueAlreadyExists(
          context ? context.contextID : undefined
        );
      }

      const nameMap = new Map<string, string>();
      for (const item in queueMeta) {
        if (queueMeta.hasOwnProperty(item)) {
          nameMap.set(item.toLowerCase(), item);
        }
      }

      // Check if all the metadata of exist queue is the same as another.
      for (const item in docMeta) {
        if (docMeta.hasOwnProperty(item)) {
          const queueMetaName = nameMap.get(item.toLowerCase());
          if (queueMetaName === undefined) {
            throw StorageErrorFactory.getQueueAlreadyExists(
              context ? context.contextID : undefined
            );
          }
          if (docMeta[item] !== queueMeta[queueMetaName]) {
            throw StorageErrorFactory.getQueueAlreadyExists(
              context ? context.contextID : undefined
            );
          }
        }
      }
      return 204;
    }

    coll.insert(queue);
    return 201;
  }

  /**
   * Delete a queue and its all messages.
   *
   * @param {string} account
   * @param {string} queue
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  public async deleteQueue(
    account: string,
    queue: string,
    context?: Context
  ): Promise<void> {
    const coll = this.db.getCollection(this.QUEUES_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: queue });

    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getQueueNotFound(requestId);
    }
    coll.remove(doc);

    const messageColl = this.db.getCollection(this.MESSAGES_COLLECTION);
    messageColl.findAndRemove({
      accountName: account,
      queueName: queue
    });
  }

  /**
   * Update the ACL of an exist queue item in persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {QueueACL} [queueACL]
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  public async setQueueACL(
    account: string,
    queue: string,
    queueACL?: QueueACL,
    context?: Context
  ): Promise<void> {
    const coll = this.db.getCollection(this.QUEUES_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: queue });

    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getQueueNotFound(requestId);
    }

    doc.queueAcl = queueACL;
    coll.update(doc);
  }

  /**
   * Update the metadata of an exist queue item in persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {QueueMetadata} [metadata]
   * @param {string} [requestId]
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  public async setQueueMetadata(
    account: string,
    queue: string,
    metadata?: IQueueMetadata,
    context?: Context
  ): Promise<void> {
    const coll = this.db.getCollection(this.QUEUES_COLLECTION);
    const doc = coll.findOne({ accountName: account, name: queue });

    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getQueueNotFound(requestId);
    }

    doc.metadata = metadata;
    coll.update(doc);
  }

  /**
   * Get the number of messages of a queue from persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {string} [requestId]
   * @returns {number}
   * @memberof LokiQueueMetadataStore
   */
  public async getMessagesCount(
    account: string,
    queue: string,
    context?: Context
  ): Promise<number> {
    const queueColl = this.db.getCollection(this.QUEUES_COLLECTION);
    const doc = queueColl.findOne({ accountName: account, name: queue });
    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getQueueNotFound(requestId);
    }

    const coll = this.db.getCollection(this.MESSAGES_COLLECTION);
    const query = { accountName: account, queueName: queue };
    const numberOfMessages = coll.count(query);

    return numberOfMessages;
  }

  /**
   * Insert a message in metadata.
   * The existence of the certain queue should be validated before.
   *
   * @param {MessageModel} message
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  public async insertMessage(
    message: MessageModel,
    context?: Context
  ): Promise<void> {
    this.checkQueueExist(message.accountName, message.queueName, context);

    const saveMessage = this.messageCopy(message);
    saveMessage.timeNextVisible = saveMessage.timeNextVisible.getTime() as any;
    const coll = this.db.getCollection(this.MESSAGES_COLLECTION);
    coll.insert(saveMessage);
  }

  /**
   * peek messages of a given number in persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {number} [numOfMessages]
   * @param {Date} [queryDate]
   * @param {Context} [context]
   * @returns {Promise<MessageModel[]>}
   * @memberof LokiQueueMetadataStore
   */
  public async peekMessages(
    account: string,
    queue: string,
    numOfMessages?: number,
    queryDate?: Date,
    context?: Context
  ): Promise<MessageModel[]> {
    this.checkQueueExist(account, queue, context);

    this.clearExpiredMessages(account, queue, context);

    const coll = this.db.getCollection(this.MESSAGES_COLLECTION);
    const queryTime = queryDate ? queryDate.getTime() : new Date().getTime();
    const query = {
      accountName: account,
      queueName: queue,
      timeNextVisible: { $lte: queryTime }
    };

    if (numOfMessages === undefined) {
      numOfMessages = 1;
    }

    const docs = coll
      .chain()
      .find(query)
      .compoundsort([
        ["timeNextVisible", false],
        ["$loki", false]
      ])
      .limit(numOfMessages)
      .data();

    const res = [] as any;
    for (const doc of docs) {
      doc.timeNextVisible = new Date(Number(doc.timeNextVisible));
      res.push(this.messageCopy(doc));
      doc.timeNextVisible = doc.timeNextVisible.getTime();
    }

    return res;
  }

  /**
   * Dequeue messages from a queue in persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {Date} timeNextVisible
   * @param {string} popReceipt
   * @param {number} [numOfMessages]
   * @param {Date} [queryDate]
   * @param {Context} [context]
   * @returns {Promise<MessageModel[]>}
   * @memberof LokiQueueMetadataStore
   */
  public async getMessages(
    account: string,
    queue: string,
    timeNextVisible: Date,
    popReceipt: string,
    numOfMessages?: number,
    queryDate?: Date,
    context?: Context
  ): Promise<MessageModel[]> {
    this.checkQueueExist(account, queue, context);

    this.clearExpiredMessages(account, queue, context);

    const coll = this.db.getCollection(this.MESSAGES_COLLECTION);
    const queryTime = queryDate ? queryDate.getTime() : new Date().getTime();
    const query = {
      accountName: account,
      queueName: queue,
      timeNextVisible: { $lte: queryTime }
    };

    if (numOfMessages === undefined || numOfMessages < 1) {
      numOfMessages = 1;
    }

    const docs = coll
      .chain()
      .find(query)
      .compoundsort([
        ["timeNextVisible", false],
        ["$loki", false]
      ])
      .limit(numOfMessages)
      .data();

    const visibleTimeInMillisecond = timeNextVisible.getTime();
    for (const doc of docs) {
      doc.timeNextVisible = visibleTimeInMillisecond;
      doc.popReceipt = popReceipt;
      doc.dequeueCount = Number(doc.dequeueCount) + 1;
    }
    coll.update(docs);

    const res = [] as any;
    for (const doc of docs) {
      doc.timeNextVisible = timeNextVisible;
      res.push(this.messageCopy(doc));
      doc.timeNextVisible = visibleTimeInMillisecond;
    }
    return res;
  }

  /**
   * Delete the metadata of a message from persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {string} messageId
   * @param {string} validatingPopReceipt
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  public async deleteMessage(
    account: string,
    queue: string,
    messageId: string,
    validatingPopReceipt: string,
    context?: Context
  ): Promise<void> {
    this.checkQueueExist(account, queue, context);

    this.clearExpiredMessages(account, queue, context);

    const coll = this.db.getCollection(this.MESSAGES_COLLECTION);
    const doc = coll.findOne({
      accountName: account,
      queueName: queue,
      messageId
    });

    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getMessageNotFound(requestId);
    }

    if (doc.popReceipt !== validatingPopReceipt) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getPopReceiptMismatch(requestId);
    }

    coll.remove(doc);
  }

  /**
   * Update the metadata of an exist message in persistency layer.
   *
   * @param {MessageUpdateProperties} message
   * @param {string} validatingPopReceipt
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  public async updateMessage(
    message: MessageUpdateProperties,
    validatingPopReceipt: string,
    context?: Context
  ): Promise<void> {
    this.checkQueueExist(message.accountName, message.queueName, context);

    this.clearExpiredMessages(message.accountName, message.queueName, context);

    const coll = this.db.getCollection(this.MESSAGES_COLLECTION);
    const doc = coll.findOne({
      accountName: message.accountName,
      queueName: message.queueName,
      messageId: message.messageId
    });

    if (!doc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getMessageNotFound(requestId);
    }

    if (doc.popReceipt !== validatingPopReceipt) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getPopReceiptMismatch(requestId);
    }

    doc.popReceipt = message.popReceipt;
    doc.timeNextVisible = message.timeNextVisible.getTime();
    if (message.persistency !== undefined) {
      doc.persistency = message.persistency;
    }

    coll.update(doc);
  }

  /**
   * Clear the metadata of all messages in a given queue from persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  public async clearMessages(
    account: string,
    queue: string,
    context?: Context
  ): Promise<void> {
    this.checkQueueExist(account, queue, context);

    const coll = this.db.getCollection(this.MESSAGES_COLLECTION);
    coll.findAndRemove({
      accountName: account,
      queueName: queue
    });
  }

  /**
   * List messages.
   *
   * @param {number} [maxResults]
   * @param {(number | undefined)} [marker]
   * @returns {(Promise<[MessageModel[], number | undefined]>)}
   * @memberof IQueueMetadataStore
   */
  public async listMessages(
    maxResults?: number,
    marker?: number | undefined
  ): Promise<[MessageModel[], number | undefined]> {
    const coll = this.db.getCollection(this.MESSAGES_COLLECTION);
    const query = {
      $loki: { $gt: marker }
    };

    if (maxResults === undefined) {
      maxResults = 5000;
    }

    const docs = coll.chain().find(query).limit(maxResults).data();

    if (docs.length < maxResults) {
      return [docs, undefined];
    }
    const nextMarker = docs[docs.length - 1].$loki;
    return [docs, nextMarker];
  }

  public iteratorExtents(): AsyncIterator<string[]> {
    return new QueueReferredExtentsAsyncIterator(this);
  }

  /**
   * Check the existence of a queue.
   *
   * @private
   * @param {string} account
   * @param {string} queue
   * @param {Context} [context]
   * @memberof LokiQueueMetadataStore
   */
  private checkQueueExist(
    account: string,
    queue: string,
    context?: Context
  ): void {
    const queueColl = this.db.getCollection(this.QUEUES_COLLECTION);
    const queueDoc = queueColl.findOne({ accountName: account, name: queue });
    if (!queueDoc) {
      const requestId = context ? context.contextID : undefined;
      throw StorageErrorFactory.getQueueNotFound(requestId);
    }
  }

  /**
   * Deep copy a message, return the new object.
   *
   * @private
   * @param {MessageModel} message
   * @returns {MessageModel}
   * @memberof LokiQueueMetadataStore
   */
  private messageCopy(message: MessageModel): MessageModel {
    const copyMessage: MessageModel = {
      accountName: message.accountName,
      queueName: message.queueName,
      messageId: message.messageId,
      popReceipt: message.popReceipt,
      timeNextVisible: new Date(message.timeNextVisible),
      persistency: {
        id: message.persistency.id,
        offset: message.persistency.offset,
        count: message.persistency.count
      },
      insertionTime: new Date(message.insertionTime),
      expirationTime: new Date(message.expirationTime),
      dequeueCount: message.dequeueCount
    };
    return copyMessage;
  }

  /**
   *  Deep copy a queue, return the new object.
   *
   * @private
   * @param {QueueModel} queue
   * @returns {QueueModel}
   * @memberof LokiQueueMetadataStore
   */
  private queueCopy(queue: QueueModel): QueueModel {
    const copyQueue: QueueModel = {
      accountName: queue.accountName,
      name: queue.name,
      queueAcl: queue.queueAcl,
      metadata: queue.metadata
    };
    return copyQueue;
  }

  /**
   * Escape a string to be used as a regex.
   *
   * @private
   * @param {string} regex
   * @returns {string}
   * @memberof LokiQueueMetadataStore
   */
  private escapeRegex(regex: string): string {
    return regex.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  /**
   * Clean the expired messages.
   *
   * @param {string} account
   * @param {string} queue
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof LokiQueueMetadataStore
   */
  private async clearExpiredMessages(
    account: string,
    queue: string,
    context?: Context
  ): Promise<void> {
    this.checkQueueExist(account, queue, context);

    const coll = this.db.getCollection(this.MESSAGES_COLLECTION);
    const queryTime = new Date().getTime();
    const query = {
      accountName: account,
      queueName: queue,
      expirationTime: { $lte: queryTime }
    };

    const docs = coll
      .chain()
      .find(query)
      .data();

    coll.remove(docs);
  }
}
