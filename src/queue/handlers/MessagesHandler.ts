import uuid from "uuid/v4";

import QueueStorageContext from "../context/QueueStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IMessagesHandler from "../generated/handlers/IMessagesHandler";
import { MessageModel } from "../persistence/IQueueMetadataStore";
import {
  DEFAULT_DEQUEUE_VISIBILITYTIMEOUT,
  DEFAULT_MESSAGETTL,
  DEQUEUE_NUMOFMESSAGES_MAX,
  DEQUEUE_NUMOFMESSAGES_MIN,
  DEQUEUE_VISIBILITYTIMEOUT_MAX,
  DEQUEUE_VISIBILITYTIMEOUT_MIN,
  EMPTY_EXTENT_CHUNK,
  ENQUEUE_VISIBILITYTIMEOUT_MAX,
  ENQUEUE_VISIBILITYTIMEOUT_MIN,
  MESSAGETEXT_LENGTH_MAX,
  MESSAGETTL_MIN,
  NEVER_EXPIRE_DATE,
  QUEUE_API_VERSION
} from "../utils/constants";
import {
  getPopReceipt,
  getUTF8ByteSize,
  parseXMLwithEmpty,
  readStreamToString
} from "../utils/utils";
import BaseHandler from "./BaseHandler";

/**
 * MessagesHandler handles Azure Storage messages related requests.
 *
 * @export
 * @class MessagesHandler
 * @implements {IMessagesHandler}
 */
export default class MessagesHandler extends BaseHandler
  implements IMessagesHandler {
  /**
   * Dequeue the messages.
   *
   * @param {Models.MessagesDequeueOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.MessagesDequeueResponse>}
   * @memberof MessagesHandler
   */
  public async dequeue(
    options: Models.MessagesDequeueOptionalParams,
    context: Context
  ): Promise<Models.MessagesDequeueResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    const popReceipt = getPopReceipt(context.startTime!);

    // Validate the query parameters.
    const timeNextVisible = new Date(
      context.startTime!.getTime() + DEFAULT_DEQUEUE_VISIBILITYTIMEOUT * 1000 // 30s as default, convert to ms
    );
    if (options.visibilitytimeout !== undefined) {
      if (
        options.visibilitytimeout < DEQUEUE_VISIBILITYTIMEOUT_MIN ||
        options.visibilitytimeout > DEQUEUE_VISIBILITYTIMEOUT_MAX
      ) {
        throw StorageErrorFactory.getOutOfRangeQueryParameterValue(
          context.contextID,
          {
            QueryParameterName: "visibilitytimeout",
            QueryParameterValue: `${options.visibilitytimeout}`,
            MinimumAllowed: `${DEQUEUE_VISIBILITYTIMEOUT_MIN}`,
            MaximumAllowed: `${DEQUEUE_VISIBILITYTIMEOUT_MAX}`
          }
        );
      }
      timeNextVisible.setTime(
        context.startTime!.getTime() + options.visibilitytimeout * 1000
      );
    }

    let numberOfMessages = 1;
    if (options.numberOfMessages !== undefined) {
      if (
        options.numberOfMessages < DEQUEUE_NUMOFMESSAGES_MIN ||
        options.numberOfMessages > DEQUEUE_NUMOFMESSAGES_MAX
      ) {
        throw StorageErrorFactory.getOutOfRangeQueryParameterValue(
          context.contextID,
          {
            QueryParameterName: "numofmessages",
            QueryParameterValue: `${options.numberOfMessages}`,
            MinimumAllowed: `${DEQUEUE_NUMOFMESSAGES_MIN}`,
            MaximumAllowed: `${DEQUEUE_NUMOFMESSAGES_MAX}`
          }
        );
      }
      numberOfMessages = options.numberOfMessages;
    }

    // Get metadata.
    const messages = await this.metadataStore.getMessages(
      accountName,
      queueName,
      timeNextVisible,
      popReceipt,
      numberOfMessages,
      context.startTime!,
      context
    );

    const response: any = [];
    const responseArray = response as Models.DequeuedMessageItem[];
    const responseObject = response as Models.MessagesDequeueHeaders & {
      statusCode: 200;
    };

    for (const message of messages) {
      const textStream = await this.extentStore.readExtent(
        message.persistency,
        context.contextID
      );
      const text = await readStreamToString(textStream);
      const dequeuedMessage: Models.DequeuedMessageItem = {
        ...message,
        messageText: text
      };
      responseArray.push(dequeuedMessage);
    }

    responseObject.date = context.startTime!;
    responseObject.requestId = context.contextID;
    responseObject.version = QUEUE_API_VERSION;
    responseObject.statusCode = 200;
    responseObject.clientRequestId = options.requestId;
    return response;
  }

  /**
   * Clear the messages in a queue
   *
   * @param {Models.MessagesClearOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.MessagesClearResponse>}
   * @memberof MessagesHandler
   */
  public async clear(
    options: Models.MessagesClearOptionalParams,
    context: Context
  ): Promise<Models.MessagesClearResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    await this.metadataStore.clearMessages(accountName, queueName, context);

    const response: Models.MessagesClearResponse = {
      date: context.startTime,
      requestId: queueCtx.contextID,
      statusCode: 204,
      version: QUEUE_API_VERSION,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Enqueue a message
   *
   * @param {Models.QueueMessage} queueMessage
   * @param {Models.MessagesEnqueueOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.MessagesEnqueueResponse>}
   * @memberof MessagesHandler
   */
  public async enqueue(
    queueMessage: Models.QueueMessage,
    options: Models.MessagesEnqueueOptionalParams,
    context: Context
  ): Promise<Models.MessagesEnqueueResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    if (queueMessage.messageText === undefined) {
      const body = queueCtx.request!.getBody();

      // TODO: deserialize does not support the message text with only empty character.
      // If the text is undefined, try to retrieve it from the XML body here.
      const parsedBody = await parseXMLwithEmpty(body || "");
      for (const text in parsedBody) {
        if (
          Object.hasOwnProperty.bind(parsedBody)(text) &&
          text.toLowerCase() === "messagetext"
        ) {
          queueMessage.messageText = parsedBody[text];
          break;
        }
      }
    }

    if (queueMessage.messageText === undefined) {
      throw StorageErrorFactory.getInvalidXmlDocument(queueCtx.contextID!);
    }

    if (getUTF8ByteSize(queueMessage.messageText) > MESSAGETEXT_LENGTH_MAX) {
      throw StorageErrorFactory.getRequestBodyTooLarge(queueCtx.contextID!, {
        MaxLimit: `${MESSAGETEXT_LENGTH_MAX}`
      });
    }

    const message: MessageModel = {
      accountName,
      queueName,
      messageId: uuid(),
      insertionTime: new Date(context.startTime!),
      expirationTime: new Date(
        context.startTime!.getTime() + DEFAULT_MESSAGETTL * 1000
      ), // Default ttl is 7 days.
      dequeueCount: 0,
      timeNextVisible: new Date(context.startTime!),
      popReceipt: getPopReceipt(context.startTime!),
      persistency: EMPTY_EXTENT_CHUNK // Provide an empty item to initialize the whole object.
    };

    if (options.visibilitytimeout !== undefined) {
      if (
        options.visibilitytimeout < ENQUEUE_VISIBILITYTIMEOUT_MIN ||
        options.visibilitytimeout > ENQUEUE_VISIBILITYTIMEOUT_MAX
      ) {
        throw StorageErrorFactory.getOutOfRangeQueryParameterValue(
          context.contextID,
          {
            QueryParameterName: "visibilitytimeout",
            QueryParameterValue: `${options.visibilitytimeout}`,
            MinimumAllowed: `${ENQUEUE_VISIBILITYTIMEOUT_MIN}`,
            MaximumAllowed: `${ENQUEUE_VISIBILITYTIMEOUT_MAX}`
          }
        );
      }
      message.timeNextVisible.setTime(
        context.startTime!.getTime() + options.visibilitytimeout * 1000
      );
    }

    if (options.messageTimeToLive !== undefined) {
      if (options.messageTimeToLive === -1) {
        message.expirationTime = new Date(NEVER_EXPIRE_DATE);
      } else if (options.messageTimeToLive < MESSAGETTL_MIN) {
        throw StorageErrorFactory.getInvalidQueryParameterValue(
          context.contextID,
          {
            QueryParameterName: "messagettl",
            QueryParameterValue: `${options.messageTimeToLive}`,
            Reason: `Value must be greater than or equal to 1, or -1 to indicate an infinite TTL.`
          }
        );
      } else if (
        options.visibilitytimeout !== undefined &&
        options.visibilitytimeout >= options.messageTimeToLive
      ) {
        throw StorageErrorFactory.getInvalidQueryParameterValue(
          context.contextID,
          {
            QueryParameterName: "visibilitytimeout",
            QueryParameterValue: `${options.visibilitytimeout}`,
            Reason: `messagettl must be greater than visibilitytimeout.`
          }
        );
      } else {
        if (
          new Date(NEVER_EXPIRE_DATE).getTime() - context.startTime!.getTime() <
          options.messageTimeToLive * 1000
        ) {
          message.expirationTime = new Date(NEVER_EXPIRE_DATE);
        } else {
          message.expirationTime.setTime(
            context.startTime!.getTime() + options.messageTimeToLive * 1000
          );
        }
      }
    }

    // Write data to file system after the validation pass.
    const extentChunk = await this.extentStore.appendExtent(
      Buffer.from(queueMessage.messageText),
      context.contextID
    );
    message.persistency = extentChunk;

    await this.metadataStore.insertMessage(message);

    const response: any = [];
    const responseArray = response as Models.EnqueuedMessage[];
    const responseObject = response as Models.MessagesEnqueueHeaders & {
      statusCode: 201;
    };

    const enqueuedMessage: Models.EnqueuedMessage = message;
    responseArray.push(enqueuedMessage);

    responseObject.date = context.startTime!;
    responseObject.requestId = context.contextID;
    responseObject.version = QUEUE_API_VERSION;
    responseObject.statusCode = 201;
    responseObject.clientRequestId = options.requestId;

    return response;
  }

  /**
   * get the peek messages without altering the visibility
   *
   * @param {Models.MessagesPeekOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.MessagesPeekResponse>}
   * @memberof MessagesHandler
   */
  public async peek(
    options: Models.MessagesPeekOptionalParams,
    context: Context
  ): Promise<Models.MessagesPeekResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    let numberOfMessages = 1;
    if (options.numberOfMessages !== undefined) {
      if (
        options.numberOfMessages < DEQUEUE_NUMOFMESSAGES_MIN ||
        options.numberOfMessages > DEQUEUE_NUMOFMESSAGES_MAX
      ) {
        throw StorageErrorFactory.getOutOfRangeQueryParameterValue(
          context.contextID,
          {
            QueryParameterName: "numofmessages",
            QueryParameterValue: `${options.numberOfMessages}`,
            MinimumAllowed: `${DEQUEUE_NUMOFMESSAGES_MIN}`,
            MaximumAllowed: `${DEQUEUE_NUMOFMESSAGES_MAX}`
          }
        );
      }
      numberOfMessages = options.numberOfMessages;
    }

    const messages = await this.metadataStore.peekMessages(
      accountName,
      queueName,
      numberOfMessages,
      context.startTime!,
      context
    );

    const response: any = [];
    const responseArray = response as Models.DequeuedMessageItem[];
    const responseObject = response as Models.MessagesDequeueHeaders & {
      statusCode: 200;
    };

    for (const message of messages) {
      const textStream = await this.extentStore.readExtent(
        message.persistency,
        context.contextID
      );
      const text = await readStreamToString(textStream);
      const dequeuedMessage: Models.DequeuedMessageItem = {
        ...message,
        messageText: text
      };
      responseArray.push(dequeuedMessage);
    }

    responseObject.date = context.startTime!;
    responseObject.requestId = context.contextID;
    responseObject.version = QUEUE_API_VERSION;
    responseObject.statusCode = 200;
    responseObject.clientRequestId = options.requestId;
    return response;
  }
}
