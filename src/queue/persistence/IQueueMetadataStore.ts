import ICleaner from "../../common/ICleaner";
import IDataStore from "../../common/IDataStore";
import IGCExtentProvider from "../../common/IGCExtentProvider";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { QUEUE_STATUSCODE } from "../utils/constants";

/** MODELS FOR SERVICE */
interface IServiceAdditionalProperties {
  accountName: string;
}

export type ServicePropertiesModel = Models.StorageServiceProperties &
  IServiceAdditionalProperties;

/** MODELS FOR QUEUE */
interface IQueueAdditionalProperties {
  queueAcl?: Models.SignedIdentifier[];
}

export type QueueModel = Models.QueueItem &
  IQueueAdditionalProperties &
  IServiceAdditionalProperties;

export type QueueACL = Models.SignedIdentifier[];

export interface IQueueMetadata {
  [propertyName: string]: string;
}

/** MODELS FOR MESSAGE UPDATE */
interface IMessageUpdateProperties {
  accountName: string;
  queueName: string;
  messageId: string;
  popReceipt: string;
  timeNextVisible: Date;
}

/** MODELS FOR MESSAGE */
interface IMessageAdditionalProperties {
  insertionTime: Date;
  expirationTime: Date;
  dequeueCount: number;
  persistency: IExtentChunk;
}

export type MessageModel = IMessageUpdateProperties &
  IMessageAdditionalProperties;

export type MessageUpdateProperties = IMessageUpdateProperties & {
  persistency?: IExtentChunk;
};
/**
 * This model describes a chunk inside a persistency extent for a given extent ID.
 * A chunk points to a sub-range of an extent.
 *
 * @export
 * @interface IExtentChunk
 */
export interface IExtentChunk {
  id: string; // The persistency layer storage extent ID where the chunk belongs to
  offset: number; // Chunk offset inside the extent where chunk starts in bytes
  count: number; // Chunk length in bytes
}

/**
 * Metadata store interface.
 * It keeps the metadata of accounts, queues and messages.
 *
 * @export
 * @interface IQueueMetadataStore
 * @extends {IDataStore}
 */
export interface IQueueMetadataStore extends IGCExtentProvider, IDataStore, ICleaner {
  /**
   * Update queue service properties. Create service properties document if not exists in persistency layer.
   * Assume service properties collection has been created during start method.
   *
   * @param {ServicePropertiesModel} updateProperties
   * @returns {Promise<void>}
   * @memberof IQueueMetadataStore
   */
  updateServiceProperties(
    updateProperties: ServicePropertiesModel
  ): Promise<void>;

  /**
   * Get service properties for specific storage account.
   *
   * @param {string} account
   * @returns {(Promise<ServicePropertiesModel | undefined>)}
   * @memberof IQueueMetadataStore
   */
  getServiceProperties(
    account: string
  ): Promise<ServicePropertiesModel | undefined>;

  /**
   * List queues with query conditions specified.
   *
   * @param {string} account
   * @param {string} [prefix]
   * @param {number} [maxResults]
   * @param {number} [marker]
   * @returns {(Promise<[QueueModel[], number | undefined]>)}
   * @memberof IQueueMetadataStore
   */
  listQueues(
    account: string,
    prefix?: string,
    maxResults?: number,
    marker?: number
  ): Promise<[QueueModel[], number | undefined]>;

  /**
   * Get a queue item from persistency layer by account and queue name.
   *
   * @param {string} account
   * @param {string} queue
   * @param {Context} [context]
   * @returns {Promise<QueueModel>}
   * @memberof IQueueMetadataStore
   */
  getQueue(
    account: string,
    queue: string,
    context?: Context
  ): Promise<QueueModel>;

  /**
   * Create a queue in persistency layer.
   *
   * @param {QueueModel} queue
   * @param {Context} [context]
   * @returns {Promise<QUEUE_STATUSCODE>}
   * @memberof IQueueMetadataStore
   */
  createQueue(queue: QueueModel, context?: Context): Promise<QUEUE_STATUSCODE>;

  /**
   * Delete a queue and its all messages.
   *
   * @param {string} account
   * @param {string} queue
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof IQueueMetadataStore
   */
  deleteQueue(account: string, queue: string, context?: Context): Promise<void>;

  /**
   * Update the ACL of an exist queue item in persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {QueueACL} [queueACL]
   * @param {string} [requestId]
   * @returns {Promise<void>}
   * @memberof IQueueMetadataStore
   */
  setQueueACL(
    account: string,
    queue: string,
    queueACL?: QueueACL,
    context?: Context
  ): Promise<void>;

  /**
   * Update the metadata of an exist queue item in persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {QueueMetadata} [metadata]
   * @param {string} [requestId]
   * @returns {Promise<void>}
   * @memberof IQueueMetadataStore
   */
  setQueueMetadata(
    account: string,
    queue: string,
    metadata?: IQueueMetadata,
    context?: Context
  ): Promise<void>;

  /**
   * Get the number of messages of a queue from persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {string} [requestId]
   * @returns {number}
   * @memberof IQueueMetadataStore
   */
  getMessagesCount(
    account: string,
    queue: string,
    context?: Context
  ): Promise<number>;

  /**
   * Insert a message in metadata.
   * The existence of the certain queue should be validated inside.
   *
   * @param {MessageModel} message
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof IQueueMetadataStore
   */
  insertMessage(message: MessageModel, context?: Context): Promise<void>;

  /**
   * peek messages of a given number in persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {number} [numOfMessages]
   * @param {Date} [queryDate]
   * @param {Context} [context]
   * @returns {Promise<MessageModel[]>}
   * @memberof IQueueMetadataStore
   */
  peekMessages(
    account: string,
    queue: string,
    numOfMessages?: number,
    queryDate?: Date,
    context?: Context
  ): Promise<MessageModel[]>;

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
   * @memberof IQueueMetadataStore
   */
  getMessages(
    account: string,
    queue: string,
    timeNextVisible: Date,
    popReceipt: string,
    numOfMessages?: number,
    queryDate?: Date,
    context?: Context
  ): Promise<MessageModel[]>;

  /**
   * Delete the metadata of a message from persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {string} messageId
   * @param {string} validatingPopReceipt
   * @param {string} [requestId]
   * @returns {Promise<void>}
   * @memberof IQueueMetadataStore
   */
  deleteMessage(
    account: string,
    queue: string,
    messageId: string,
    validatingPopReceipt: string,
    context?: Context
  ): Promise<void>;

  /**
   * Update the metadata of an exist message in persistency layer.
   *
   * @param {MessageUpdateProperties} message
   * @param {string} validatingPopReceipt
   * @param {Context} [context]
   * @returns {Promise<void>}
   * @memberof IQueueMetadataStore
   */
  updateMessage(
    message: MessageUpdateProperties,
    validatingPopReceipt: string,
    context?: Context
  ): Promise<void>;

  /**
   * Clear the metadata of all messages in a given queue from persistency layer.
   *
   * @param {string} account
   * @param {string} queue
   * @param {string} [requestId]
   * @returns {Promise<void>}
   * @memberof IQueueMetadataStore
   */
  clearMessages(
    account: string,
    queue: string,
    context?: Context
  ): Promise<void>;

  /**
   * List messages.
   *
   * @param {number} [maxResults]
   * @param {(number | undefined)} [marker]
   * @returns {(Promise<[MessageModel[], number | undefined]>)}
   * @memberof IQueueMetadataStore
   */
  listMessages(
    maxResults?: number,
    marker?: number | undefined
  ): Promise<[MessageModel[], number | undefined]>;
}

export default IQueueMetadataStore;
