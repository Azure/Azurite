import StorageErrorFactory from "../../queue/errors/StorageErrorFactory";
import QueueStorageContext from "../context/QueueStorageContext";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import IQueueHandler from "../generated/handlers/IQueueHandler";
import { QueueModel } from "../persistence/IQueueMetadataStore";
import {
  HeaderConstants,
  QUEUE_API_VERSION,
  QUEUE_SERVICE_PERMISSION
} from "../utils/constants";
import BaseHandler from "./BaseHandler";

/**
 * QueueHandler handles Azure Storage queue related requests.
 *
 * @export
 * @class QueueHandler
 * @implements {IQueueHandler}
 */
export default class QueueHandler extends BaseHandler implements IQueueHandler {
  /**
   * Create a queue with queueName.
   *
   * @param {Models.QueueCreateOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.QueueCreateResponse>}
   * @memberof QueueHandler
   */
  public async create(
    options: Models.QueueCreateOptionalParams,
    context: Context
  ): Promise<Models.QueueCreateResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    const req = context.request! as any;
    const rawHeaders = req.req.rawHeaders;

    // The same as Azure Storage, should preserve the case of metadata names with them created.
    const metadata = this.parseMetadata(options.metadata, rawHeaders);

    const queue: QueueModel = {
      accountName,
      name: queueName,
      metadata
    };

    const statusCode = await this.metadataStore.createQueue(queue, context);

    const response: Models.QueueCreateResponse = {
      date: context.startTime,
      requestId: queueCtx.contextID,
      statusCode,
      version: QUEUE_API_VERSION,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Delete a queue according to its name.
   *
   * @param {Models.QueueDeleteMethodOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.QueueDeleteResponse>}
   * @memberof QueueHandler
   */
  public async delete(
    options: Models.QueueDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.QueueDeleteResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    await this.metadataStore.deleteQueue(accountName, queueName, context);

    const response: Models.QueueDeleteResponse = {
      date: context.startTime,
      requestId: context.contextID,
      statusCode: 204,
      version: QUEUE_API_VERSION,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Get queue metadata.
   *
   * @param {Models.QueueGetPropertiesOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.QueueGetPropertiesResponse>}
   * @memberof QueueHandler
   */
  public async getProperties(
    options: Models.QueueGetPropertiesOptionalParams,
    context: Context
  ): Promise<Models.QueueGetPropertiesResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    const queue = await this.metadataStore.getQueue(
      accountName,
      queueName,
      context
    );

    const response: Models.QueueGetPropertiesResponse = {
      approximateMessagesCount: await this.metadataStore.getMessagesCount(
        queue.accountName,
        queue.name
      ),
      metadata: queue.metadata,
      date: context.startTime,
      requestId: context.contextID,
      statusCode: 200,
      version: QUEUE_API_VERSION,
      clientRequestId: options.requestId
    };
    return response;
  }

  /**
   * Get queue metadata with Head.
   *
   * @param {Models.QueueGetPropertiesWithHeadOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.QueueGetPropertiesWithHeadResponse>}
   * @memberof QueueHandler
   */
  public async getPropertiesWithHead(
    options: Models.QueueGetPropertiesWithHeadOptionalParams,
    context: Context
  ): Promise<Models.QueueGetPropertiesWithHeadResponse> {
    return this.getProperties(options, context);
  }

  /**
   * Set queue metadata.
   *
   * @param {Models.QueueSetMetadataOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.QueueSetMetadataResponse>}
   * @memberof QueueHandler
   */
  public async setMetadata(
    options: Models.QueueSetMetadataOptionalParams,
    context: Context
  ): Promise<Models.QueueSetMetadataResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    const req = context.request! as any;
    const rawHeaders = req.req.rawHeaders;

    const metadata = this.parseMetadata(options.metadata, rawHeaders);

    await this.metadataStore.setQueueMetadata(
      accountName,
      queueName,
      metadata,
      context
    );

    const response: Models.QueueSetMetadataResponse = {
      date: context.startTime,
      requestId: context.contextID,
      statusCode: 204,
      version: QUEUE_API_VERSION,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Get queue access policies.
   *
   * @param {Models.QueueGetAccessPolicyOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.QueueGetAccessPolicyResponse>}
   * @memberof ContainerHandler
   */
  public async getAccessPolicy(
    options: Models.QueueGetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.QueueGetAccessPolicyResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    const queue = await this.metadataStore.getQueue(
      accountName,
      queueName,
      context
    );

    const response: any = [];
    const responseArray = response as Models.SignedIdentifier[];
    const responseObject = response as Models.QueueGetAccessPolicyHeaders & {
      statusCode: 200;
    };
    if (queue.queueAcl !== undefined) {
      responseArray.push(...queue.queueAcl);
    }
    responseObject.date = context.startTime;
    responseObject.requestId = context.contextID;
    responseObject.version = QUEUE_API_VERSION;
    responseObject.statusCode = 200;
    responseObject.clientRequestId = options.requestId;

    return response;
  }

  /**
   * Get queue access policies with Head.
   *
   * @param {Models.QueueGetAccessPolicyWithHeadOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.QueueGetAccessPolicyWithHeadResponse>}
   * @memberof QueueHandler
   */
  public async getAccessPolicyWithHead(
    options: Models.QueueGetAccessPolicyWithHeadOptionalParams,
    context: Context
  ): Promise<Models.QueueGetAccessPolicyWithHeadResponse> {
    return this.getAccessPolicy(options, context);
  }

  /**
   * Set queue access policies.
   *
   * @param {Models.QueueSetAccessPolicyOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.QueueSetAccessPolicyResponse>}
   * @memberof ContainerHandler
   */
  public async setAccessPolicy(
    options: Models.QueueSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.QueueSetAccessPolicyResponse> {
    const queueCtx = new QueueStorageContext(context);
    const accountName = queueCtx.account!;
    const queueName = queueCtx.queue!;

    // The policy number should be within 5, the permission should follow the Queue permission.
    // See as https://docs.microsoft.com/en-us/rest/api/storageservices/create-service-sas.
    if (options.queueAcl !== undefined) {
      if (options.queueAcl.length > 5) {
        throw StorageErrorFactory.getInvalidXmlDocument(context.contextID);
      }

      for (const acl of options.queueAcl) {
        const permission = acl.accessPolicy.permission;
        if (permission !== undefined)
        {
          for (const item of permission) {
            if (!QUEUE_SERVICE_PERMISSION.includes(item)) {
              throw StorageErrorFactory.getInvalidXmlDocument(context.contextID);
            }
          }
        }
      }
    }

    await this.metadataStore.setQueueACL(
      accountName,
      queueName,
      options.queueAcl,
      context
    );

    const response: Models.QueueSetAccessPolicyResponse = {
      date: context.startTime,
      requestId: context.contextID,
      version: QUEUE_API_VERSION,
      statusCode: 204,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Parse and retrieve the original metadata name headers array to preserve its case.
   *
   * @private
   * @param {({ [propertyName: string]: string } | undefined)} reqMetadata
   * @param {{ [id: string]: string }} headers
   * @returns
   * @memberof QueueHandler
   */
  private parseMetadata(
    reqMetadata: { [propertyName: string]: string } | undefined,
    headers: { [id: string]: string }
  ) {
    if (reqMetadata === undefined) {
      return undefined;
    }

    // TODO: Should take care about the robustness.
    const metaPrefix = HeaderConstants.X_MS_META;
    const metadata: { [propertyName: string]: string } = {};
    for (const item in reqMetadata) {
      if (reqMetadata.hasOwnProperty(item)) {
        for (const id in headers) {
          if (headers.hasOwnProperty(id)) {
            const name = headers[id];
            if (metaPrefix + item === name.toLowerCase()) {
              metadata[name.substr(metaPrefix.length)] = reqMetadata[item];
              break;
            }
          }
        }
      }
    }

    return metadata;
  }
}
