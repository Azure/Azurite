import QueueStorageContext from "../context/QueueStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IMessageIdHandler from "../generated/handlers/IMessageIdHandler";
import { MessageUpdateProperties } from "../persistence/IQueueMetadataStore";
import {
  DEFAULT_UPDATE_VISIBILITYTIMEOUT,
  MESSAGETEXT_LENGTH_MAX,
  QUEUE_API_VERSION,
  UPDATE_VISIBILITYTIMEOUT_MAX,
  UPDATE_VISIBILITYTIMEOUT_MIN
} from "../utils/constants";
import {
  getPopReceipt,
  getUTF8ByteSize,
  parseXMLwithEmpty
} from "../utils/utils";
import BaseHandler from "./BaseHandler";

/**
 * MessageIdHandler handles Azure Storage a given message related requests.
 *
 * @export
 * @class MessageIdHandler
 * @implements {IMessageIdHandler}
 */
export default class MessageIdHandler extends BaseHandler
  implements IMessageIdHandler {
  /**
   * Update a message.
   *
   * @param {Models.QueueMessage} queueMessage
   * @param {string} popReceipt
   * @param {number} visibilitytimeout
   * @param {Models.MessageIdUpdateOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.MessageIdUpdateResponse>}
   * @memberof MessageIdHandler
   */
  public async update(
    queueMessage: Models.QueueMessage,
    popReceipt: string,
    visibilitytimeout: number,
    options: Models.MessageIdUpdateOptionalParams,
    context: Context
  ): Promise<Models.MessageIdUpdateResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;
    const messageId = queueCtx.messageId!;

    // TODO: Similar to enqueue, deserialize does not support the message text with only empty character.
    // If the text is undefined, try to retrieve it from the XML body here.
    if (queueMessage.messageText === undefined) {
      const body = queueCtx.request!.getBody();
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

    // Check if the text is out of range.
    if (
      queueMessage.messageText !== undefined &&
      getUTF8ByteSize(queueMessage.messageText) > MESSAGETEXT_LENGTH_MAX
    ) {
      throw StorageErrorFactory.getRequestBodyTooLarge(queueCtx.contextID!, {
        MaxLimit: "65536"
      });
    }

    const newPopReceipt = getPopReceipt(context.startTime!);

    // Validate the query parameters.
    const timeNextVisible = new Date(
      context.startTime!.getTime() + DEFAULT_UPDATE_VISIBILITYTIMEOUT * 1000 // 30s as default
    );
    if (visibilitytimeout !== undefined) {
      if (
        visibilitytimeout < UPDATE_VISIBILITYTIMEOUT_MIN ||
        visibilitytimeout > UPDATE_VISIBILITYTIMEOUT_MAX
      ) {
        throw StorageErrorFactory.getOutOfRangeQueryParameterValue(
          context.contextID,
          {
            QueryParameterName: "visibilitytimeout",
            QueryParameterValue: `${visibilitytimeout}`,
            MinimumAllowed: `${UPDATE_VISIBILITYTIMEOUT_MIN}`,
            MaximumAllowed: `${UPDATE_VISIBILITYTIMEOUT_MAX}`
          }
        );
      }
      timeNextVisible.setTime(
        context.startTime!.getTime() + visibilitytimeout * 1000
      );
    }

    // Initial the persistency with undefined, denoting no text change.
    const message: MessageUpdateProperties = {
      accountName,
      queueName,
      messageId,
      popReceipt: newPopReceipt,
      timeNextVisible,
      persistency: undefined
    };

    // If the given message text is valid, then the stored text should be updated if the popReceipt is correct.
    // The data will be first write to extent,
    // then the popRecept should be check in metadata store to determine update or not.
    if (queueMessage.messageText !== undefined) {
      message.persistency = await this.extentStore.appendExtent(
        Buffer.from(queueMessage.messageText),
        context.contextID
      );
    }

    await this.metadataStore.updateMessage(message, popReceipt, context);

    const response: Models.MessageIdUpdateResponse = {
      popReceipt: newPopReceipt,
      timeNextVisible,
      date: context.startTime,
      requestId: context.contextID,
      version: QUEUE_API_VERSION,
      statusCode: 204,
      clientRequestId: options.requestId
    };
    return response;
  }

  /**
   * Delete a message.
   *
   * @param {string} popReceipt
   * @param {Models.MessageIdDeleteMethodOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.MessageIdDeleteResponse>}
   * @memberof MessageIdHandler
   */
  public async delete(
    popReceipt: string,
    options: Models.MessageIdDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.MessageIdDeleteResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;
    const messageId = queueCtx.messageId!;

    await this.metadataStore.deleteMessage(
      accountName,
      queueName,
      messageId,
      popReceipt,
      context
    );

    const response: Models.MessageIdDeleteResponse = {
      date: context.startTime,
      requestId: context.contextID,
      version: QUEUE_API_VERSION,
      statusCode: 204,
      clientRequestId: options.requestId
    };
    return response;
  }
}
