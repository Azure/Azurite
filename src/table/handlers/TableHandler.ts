import toReadableStream from 'to-readable-stream';

import BufferStream from '../../common/utils/BufferStream';
import { checkEtagIsInvalidFormat, newTableEntityEtag } from '../../common/utils/utils';
import TableBatchOrchestrator from '../batch/TableBatchOrchestrator';
import TableBatchUtils from '../batch/TableBatchUtils';
import TableStorageContext from '../context/TableStorageContext';
import { NormalizedEntity } from '../entity/NormalizedEntity';
import StorageErrorFactory from '../errors/StorageErrorFactory';
import * as Models from '../generated/artifacts/models';
import Context from '../generated/Context';
import ITableHandler from '../generated/handlers/ITableHandler';
import { Entity, Table } from '../persistence/ITableMetadataStore';
import {
    DEFAULT_TABLE_LISTENING_PORT, DEFAULT_TABLE_SERVER_HOST_NAME, FULL_METADATA_ACCEPT,
    HeaderConstants, MINIMAL_METADATA_ACCEPT, NO_METADATA_ACCEPT, RETURN_CONTENT, RETURN_NO_CONTENT,
    TABLE_API_VERSION, TABLE_SERVICE_PERMISSION
} from '../utils/constants';
import {
    getEntityOdataAnnotationsForResponse, getPayloadFormat, getTableOdataAnnotationsForResponse,
    getTablePropertiesOdataAnnotationsForResponse, updateTableOptionalOdataAnnotationsForResponse,
    validateTableName
} from '../utils/utils';
import BaseHandler from './BaseHandler';

interface IPartialResponsePreferProperties {
  statusCode: 200 | 201 | 204;
  preferenceApplied?: string;
}

/**
 * TODO:
 * 1. Check Accept for every API
 * 2. Check Prefer for every API
 */

export default class TableHandler extends BaseHandler implements ITableHandler {
  public async create(
    tableProperties: Models.TableProperties,
    options: Models.TableCreateOptionalParams,
    context: Context
  ): Promise<Models.TableCreateResponse> {
    const tableContext = new TableStorageContext(context);
    const accept = this.getAndCheckPayloadFormat(tableContext);
    const account = this.getAndCheckAccountName(tableContext);
    const table = tableProperties.tableName; // Table name is in request body instead of URL
    if (table === undefined) {
      throw StorageErrorFactory.getTableNameEmpty(context);
    }

    // validate table name
    if (table !== undefined) {
      validateTableName(context, table);
    }

    const tableModel: Table = {
      account,
      table
    };

    await this.metadataStore.createTable(context, tableModel);

    const response: Models.TableCreateResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 201
    };

    response.tableName = table;
    updateTableOptionalOdataAnnotationsForResponse(
      response,
      account,
      table,
      this.getOdataAnnotationUrlPrefix(tableContext, account),
      accept
    );

    this.updateResponsePrefer(response, tableContext);
    this.updateResponseAccept(tableContext, accept);

    return response;
  }

  public async delete(
    _table: string,
    options: Models.TableDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteResponse> {
    const tableContext = new TableStorageContext(context);
    const account = this.getAndCheckAccountName(tableContext);
    const table = this.getAndCheckTableName(tableContext);
    const accept = this.getAndCheckPayloadFormat(tableContext);

    await this.metadataStore.deleteTable(context, table, account!);

    const response: Models.TableDeleteResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 204
    };

    this.updateResponseAccept(tableContext, accept);

    return response;
  }

  public async query(
    options: Models.TableQueryOptionalParams,
    context: Context
  ): Promise<Models.TableQueryResponse2> {
    const tableContext = new TableStorageContext(context);
    const account = this.getAndCheckAccountName(tableContext);
    const accept = this.getAndCheckPayloadFormat(tableContext);

    const [tableResult, nextTableName] = await this.metadataStore.queryTable(
      context,
      account,
      options.queryOptions || {},
      options.nextTableName
    );

    const response: Models.TableQueryResponse2 = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 200,
      xMsContinuationNextTableName: nextTableName,
      value: []
    };

    const prefix = this.getOdataAnnotationUrlPrefix(tableContext, account);
    const annotation = getTableOdataAnnotationsForResponse(account, "", prefix);

    if (accept === MINIMAL_METADATA_ACCEPT || accept === FULL_METADATA_ACCEPT) {
      response.odatametadata = annotation.odatametadata;
    }

    response.value = tableResult.map((item) =>
      getTablePropertiesOdataAnnotationsForResponse(
        item.table,
        account,
        prefix,
        accept
      )
    );

    this.updateResponseAccept(tableContext, accept);
    return response;
  }

  // TODO: Filter odata types per accept settings
  public async insertEntity(
    _tableName: string,
    options: Models.TableInsertEntityOptionalParams,
    context: Context
  ): Promise<Models.TableInsertEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const account = this.getAndCheckAccountName(tableContext);
    const table = this.getAndCheckTableName(tableContext);
    const accept = this.getAndCheckPayloadFormat(tableContext);
    const prefer = this.getAndCheckPreferHeader(tableContext);

    // curently unable to use checking functions as the partitionKey
    // and rowKey are not coming through the context.
    // const partitionKey = this.getAndCheckPartitionKey(tableContext);
    // const rowKey = this.getAndCheckRowKey(tableContext);
    if (
      !options.tableEntityProperties ||
      // rowKey and partitionKey may be empty string
      options.tableEntityProperties.PartitionKey === null ||
      options.tableEntityProperties.RowKey === null
    ) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }

    const entity: Entity = {
      PartitionKey: options.tableEntityProperties.PartitionKey,
      RowKey: options.tableEntityProperties.RowKey,
      properties: options.tableEntityProperties,
      lastModifiedTime: context.startTime!,
      eTag: newTableEntityEtag(context.startTime!)
    };

    let nomarlizedEntity;
    try {
      nomarlizedEntity = new NormalizedEntity(entity);
      nomarlizedEntity.normalize();
    } catch (e) {
      this.logger.error(
        `TableHandler:insertEntity() ${e.name} ${JSON.stringify(e.stack)}`,
        context.contextID
      );
      throw StorageErrorFactory.getInvalidInput(context);
    }

    await this.metadataStore.insertTableEntity(context, table, account, entity);

    const response: Models.TableInsertEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 201,
      eTag: entity.eTag
    };

    if (prefer === RETURN_CONTENT || prefer === undefined) {
      const body = {} as any;
      const annotation = getEntityOdataAnnotationsForResponse(
        account,
        table,
        this.getOdataAnnotationUrlPrefix(tableContext, account),
        options.tableEntityProperties.PartitionKey,
        options.tableEntityProperties.RowKey,
        accept
      );

      if (accept === MINIMAL_METADATA_ACCEPT) {
        body["odata.metadata"] = annotation.odatametadata;
        body["odata.etag"] = entity.eTag;
      }

      if (accept === FULL_METADATA_ACCEPT) {
        body["odata.metadata"] = annotation.odatametadata;
        body["odata.type"] = annotation.odatatype;
        body["odata.id"] = annotation.odataid;
        body["odata.etag"] = entity.eTag;
        body["odata.editLink"] = annotation.odataeditLink;
      }

      // for (const key of Object.keys(entity.properties)) {
      //   body[key] = entity.properties[key];
      // }

      // response.body = new BufferStream(Buffer.from(JSON.stringify(body)));
      const rawResponse = nomarlizedEntity.toResponseString(accept, body);
      this.logger.debug(
        `TableHandler:insertEntity() Raw response string is ${JSON.stringify(
          rawResponse
        )}`,
        context.contextID
      );
      response.body = new BufferStream(Buffer.from(rawResponse));
    }

    this.updateResponseAccept(tableContext, accept);
    this.updateResponsePrefer(response, tableContext);

    return response;
  }

  // TODO: Create data structures to hold entity properties and support serialize, merge, deserialize, filter
  // Note: Batch is using the partition key and row key args, handler receives these values from middleware via
  // context
  public async updateEntity(
    _table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableUpdateEntityOptionalParams,
    context: Context
  ): Promise<Models.TableUpdateEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const account = this.getAndCheckAccountName(tableContext);
    const table = this.getAndCheckTableName(tableContext);
    partitionKey = partitionKey || this.getAndCheckPartitionKey(tableContext);
    rowKey = rowKey || this.getAndCheckRowKey(tableContext);
    const ifMatch = options.ifMatch;

    if (!options.tableEntityProperties) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }

    if (
      options.tableEntityProperties.PartitionKey !== partitionKey ||
      options.tableEntityProperties.RowKey !== rowKey
    ) {
      this.logger.warn(
        `TableHandler:updateEntity() Incoming PartitionKey:${partitionKey} RowKey:${rowKey} in URL parameters don't align with entity body PartitionKey:${options.tableEntityProperties.PartitionKey} RowKey:${options.tableEntityProperties.RowKey}.`
      );
    }

    // Test if etag is available
    // this is considered an upsert if no etag header, an empty header is an error.
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-or-replace-entity
    if (ifMatch === "") {
      throw StorageErrorFactory.getPreconditionFailed(context);
    }
    if (options?.ifMatch && options.ifMatch !== "*") {
      if (checkEtagIsInvalidFormat(options.ifMatch)) {
        throw StorageErrorFactory.getInvalidOperation(context);
      }
    }

    const eTag = newTableEntityEtag(context.startTime!);

    // Entity, which is used to update an existing entity
    const entity: Entity = {
      PartitionKey: partitionKey,
      RowKey: rowKey,
      properties: options.tableEntityProperties,
      lastModifiedTime: context.startTime!,
      eTag
    };

    let nomarlizedEntity;
    try {
      nomarlizedEntity = new NormalizedEntity(entity);
      nomarlizedEntity.normalize();
    } catch (e) {
      this.logger.error(
        `TableHandler:updateEntity() ${e.name} ${JSON.stringify(e.stack)}`,
        context.contextID
      );
      throw StorageErrorFactory.getInvalidInput(context);
    }

    await this.metadataStore.insertOrUpdateTableEntity(
      context,
      table,
      account,
      entity,
      ifMatch
    );

    // Response definition
    const response: Models.TableUpdateEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      eTag,
      statusCode: 204
    };

    return response;
  }

  public async mergeEntity(
    _table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableMergeEntityOptionalParams,
    context: Context
  ): Promise<Models.TableMergeEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const account = this.getAndCheckAccountName(tableContext);
    const table = this.getAndCheckTableName(tableContext);
    partitionKey = partitionKey || this.getAndCheckPartitionKey(tableContext);
    rowKey = rowKey || this.getAndCheckRowKey(tableContext);

    if (!options.tableEntityProperties) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }
    if (options?.ifMatch && options.ifMatch !== "*" && options.ifMatch !== "") {
      if (checkEtagIsInvalidFormat(options.ifMatch)) {
        throw StorageErrorFactory.getInvalidOperation(context);
      }
    }

    if (
      options.tableEntityProperties.PartitionKey !== partitionKey ||
      options.tableEntityProperties.RowKey !== rowKey
    ) {
      this.logger.warn(
        `TableHandler:mergeEntity() Incoming PartitionKey:${partitionKey} RowKey:${rowKey} in URL parameters don't align with entity body PartitionKey:${options.tableEntityProperties.PartitionKey} RowKey:${options.tableEntityProperties.RowKey}.`
      );
    }

    const eTag = newTableEntityEtag(context.startTime!);

    const entity: Entity = {
      PartitionKey: partitionKey,
      RowKey: rowKey,
      properties: options.tableEntityProperties,
      lastModifiedTime: context.startTime!,
      eTag
    };

    let nomarlizedEntity;
    try {
      nomarlizedEntity = new NormalizedEntity(entity);
      nomarlizedEntity.normalize();
    } catch (e) {
      this.logger.error(
        `TableHandler:mergeEntity() ${e.name} ${JSON.stringify(e.stack)}`,
        context.contextID
      );
      throw StorageErrorFactory.getInvalidInput(context);
    }

    await this.metadataStore.insertOrMergeTableEntity(
      context,
      table,
      account,
      entity,
      options.ifMatch
    );

    const response: Models.TableMergeEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 204,
      eTag
    };

    return response;
  }

  public async deleteEntity(
    _table: string,
    partitionKey: string,
    rowKey: string,
    ifMatch: string,
    options: Models.TableDeleteEntityOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const accountName = tableContext.account;
    partitionKey = partitionKey || tableContext.partitionKey!; // Get partitionKey from context
    rowKey = rowKey || tableContext.rowKey!; // Get rowKey from context

    if (!partitionKey || !rowKey) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }
    if (ifMatch === "" || ifMatch === undefined) {
      throw StorageErrorFactory.getPreconditionFailed(context);
    }
    if (ifMatch !== "*" && checkEtagIsInvalidFormat(ifMatch)) {
      throw StorageErrorFactory.getInvalidOperation(context);
    }
    // currently the props are not coming through as args, so we take them from the table context
    await this.metadataStore.deleteTableEntity(
      context,
      tableContext.tableName!,
      accountName!,
      partitionKey,
      rowKey,
      ifMatch
    );

    return {
      statusCode: 204,
      date: tableContext.startTime,
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION
    };
  }

  public async queryEntities(
    _table: string,
    options: Models.TableQueryEntitiesOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesResponse> {
    const tableContext = new TableStorageContext(context);
    const table = this.getAndCheckTableName(tableContext);
    const account = this.getAndCheckAccountName(tableContext);
    const accept = this.getAndCheckPayloadFormat(tableContext);

    const [
      result,
      nextPartitionKey,
      nextRowKey
    ] = await this.metadataStore.queryTableEntities(
      context,
      account,
      table,
      options.queryOptions || {},
      options.nextPartitionKey,
      options.nextRowKey
    );

    const response: Models.TableQueryEntitiesResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      xMsContinuationNextPartitionKey: nextPartitionKey,
      xMsContinuationNextRowKey: nextRowKey,
      statusCode: 200
    };

    let selectSet: Set<string> | undefined;
    const selectArray = options.queryOptions?.select
      ?.split(",")
      .filter((item) => {
        return typeof item === "string" && item.length > 0;
      })
      .map((item) => item.trim());
    if (selectArray && selectArray.length > 0) {
      selectSet = new Set(selectArray);
    }

    const entities: string[] = [];
    const odataPrefix = this.getOdataAnnotationUrlPrefix(tableContext, account);
    result.forEach((element) => {
      const entity = {} as any;
      const annotation = getEntityOdataAnnotationsForResponse(
        account,
        table,
        odataPrefix,
        element.PartitionKey,
        element.RowKey,
        accept
      );

      if (
        accept === MINIMAL_METADATA_ACCEPT ||
        accept === FULL_METADATA_ACCEPT
      ) {
        entity["odata.etag"] = element.eTag;
      }

      if (accept === FULL_METADATA_ACCEPT) {
        entity["odata.type"] = annotation.odatatype;
        entity["odata.id"] = annotation.odataid;
        entity["odata.editLink"] = annotation.odataeditLink;
      }

      const nomarlizedEntity = new NormalizedEntity(element);
      entities.push(
        nomarlizedEntity.toResponseString(accept, entity, selectSet)
      );
    });

    const odatametadata = getEntityOdataAnnotationsForResponse(
      account,
      table,
      odataPrefix,
      "",
      "",
      accept
    ).odatametadata;

    const odatametadataPariString = odatametadata
      ? `"odata.metadata":${JSON.stringify(odatametadata)},`
      : "";

    const body = `{${odatametadataPariString}"value":[${entities.join(",")}]}`;
    response.body = new BufferStream(Buffer.from(body));

    this.logger.debug(
      `TableHandler:queryEntities() Raw response string is ${JSON.stringify(
        body
      )}`,
      context.contextID
    );

    this.updateResponseAccept(tableContext, accept);

    return response;
  }

  public async queryEntitiesWithPartitionAndRowKey(
    _table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableQueryEntitiesWithPartitionAndRowKeyOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesWithPartitionAndRowKeyResponse> {
    const tableContext = new TableStorageContext(context);
    const account = this.getAndCheckAccountName(tableContext);
    const table = _table ? _table : this.getAndCheckTableName(tableContext);
    partitionKey = partitionKey || this.getAndCheckPartitionKey(tableContext);
    rowKey = rowKey || this.getAndCheckRowKey(tableContext);
    const accept = this.getAndCheckPayloadFormat(tableContext);

    const entity = await this.metadataStore.queryTableEntitiesWithPartitionAndRowKey(
      context,
      table,
      account,
      partitionKey,
      rowKey
    );

    if (entity === undefined || entity === null) {
      throw StorageErrorFactory.getEntityNotFound(context);
    }

    const response: Models.TableQueryEntitiesWithPartitionAndRowKeyResponse = {
      statusCode: 200,
      date: tableContext.startTime,
      clientRequestId: options.requestId,
      requestId: context.contextID,
      version: TABLE_API_VERSION
    };

    const body = {} as any;
    const annotation = getEntityOdataAnnotationsForResponse(
      account,
      table,
      this.getOdataAnnotationUrlPrefix(tableContext, account),
      partitionKey,
      rowKey,
      accept
    );

    if (accept === MINIMAL_METADATA_ACCEPT) {
      body["odata.metadata"] = annotation.odatametadata;
      body["odata.etag"] = entity.eTag;
    }

    if (accept === FULL_METADATA_ACCEPT) {
      body["odata.metadata"] = annotation.odatametadata;
      body["odata.type"] = annotation.odatatype;
      body["odata.id"] = annotation.odataid;
      body["odata.etag"] = entity.eTag;
      body["odata.editLink"] = annotation.odataeditLink;
    }

    let selectSet: Set<string> | undefined;
    const selectArray = options.queryOptions?.select
      ?.split(",")
      .filter((item) => {
        return typeof item === "string" && item.length > 0;
      })
      .map((item) => item.trim());
    if (selectArray && selectArray.length > 0) {
      selectSet = new Set(selectArray);
    }

    const nomarlizedEntity = new NormalizedEntity(entity);
    const rawResponse = nomarlizedEntity.toResponseString(
      accept,
      body,
      selectSet
    );
    response.body = new BufferStream(Buffer.from(rawResponse));

    this.logger.debug(
      `TableHandler:queryEntities() Raw response string is ${JSON.stringify(
        rawResponse
      )}`,
      context.contextID
    );

    this.updateResponseAccept(tableContext, accept);
    return response;
  }

  public async mergeEntityWithMerge(
    table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableMergeEntityWithMergeOptionalParams,
    context: Context
  ): Promise<Models.TableMergeEntityWithMergeResponse> {
    return this.mergeEntity(
      table,
      partitionKey,
      rowKey,
      options as any,
      context
    );
  }

  /**
   * Get table access policies.
   * @param {string} table
   * @param {Models.TableGetAccessPolicyOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.TableGetAccessPolicyResponse>}
   * @memberof TableHandler
   */
  public async getAccessPolicy(
    table: string,
    options: Models.TableGetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableGetAccessPolicyResponse> {
    const tableContext = new TableStorageContext(context);
    const accountName = this.getAndCheckAccountName(tableContext);
    const tableName = this.getAndCheckTableName(tableContext);

    const foundTable = await this.metadataStore.getTable(
      accountName,
      tableName,
      context
    );

    const response: any = [];
    const responseArray = response as Models.SignedIdentifier[];
    const responseObject = response as Models.TableGetAccessPolicyHeaders & {
      statusCode: 200;
    };
    if (foundTable.tableAcl !== undefined) {
      responseArray.push(...foundTable.tableAcl);
    }
    responseObject.date = context.startTime;
    responseObject.requestId = context.contextID;
    responseObject.version = TABLE_API_VERSION;
    responseObject.statusCode = 200;
    responseObject.clientRequestId = options.requestId;

    return response;
  }

  /**
   * Set table access policies.
   * @param {string} table
   * @param {Models.TableSetAccessPolicyOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.TableSetAccessPolicyResponse>}
   * @memberof TableHandler
   */

  public async setAccessPolicy(
    table: string,
    options: Models.TableSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableSetAccessPolicyResponse> {
    const tableContext = new TableStorageContext(context);
    const accountName = this.getAndCheckAccountName(tableContext);
    const tableName = this.getAndCheckTableName(tableContext);

    // The policy number should be within 5, the permission should follow the Table permission.
    // See as https://docs.microsoft.com/en-us/rest/api/storageservices/create-service-sas.
    if (options.tableAcl !== undefined) {
      if (options.tableAcl.length > 5) {
        throw StorageErrorFactory.getInvalidXmlDocument(context);
      }

      for (const acl of options.tableAcl) {
        const permission = acl.accessPolicy.permission;
        for (const item of permission) {
          if (!TABLE_SERVICE_PERMISSION.includes(item)) {
            throw StorageErrorFactory.getInvalidXmlDocument(context);
          }
        }
      }
    }

    await this.metadataStore.setTableACL(
      accountName,
      tableName,
      context,
      options.tableAcl
    );

    const response: Models.TableSetAccessPolicyResponse = {
      date: context.startTime,
      requestId: context.contextID,
      version: TABLE_API_VERSION,
      statusCode: 204,
      clientRequestId: options.requestId
    };

    return response;
  }

  /**
   * Processes an entity group transaction request / batch request
   *
   * @param {NodeJS.ReadableStream} body
   * @param {string} multipartContentType
   * @param {number} contentLength
   * @param {Models.TableBatchOptionalParams} options
   * @param {Context} context
   * @return {*}  {Promise<Models.TableBatchResponse>}
   * @memberof TableHandler
   */
  public async batch(
    body: NodeJS.ReadableStream,
    multipartContentType: string,
    contentLength: number,
    options: Models.TableBatchOptionalParams,
    context: Context
  ): Promise<Models.TableBatchResponse> {
    const tableCtx = new TableStorageContext(context);
    const contentTypeResponse = tableCtx.request
      ?.getHeader("content-type")
      ?.replace("batch", "batchresponse");
    const tableBatchManager = new TableBatchOrchestrator(tableCtx, this);

    const requestBody = await TableBatchUtils.StreamToString(body);
    this.logger.debug(
      `TableHandler:batch() Raw request string is ${JSON.stringify(
        requestBody
      )}`,
      context.contextID
    );

    const response = await tableBatchManager.processBatchRequestAndSerializeResponse(
      requestBody
    );

    this.logger.debug(
      `TableHandler:batch() Raw response string is ${JSON.stringify(response)}`,
      context.contextID
    );

    // need to convert response to NodeJS.ReadableStream
    body = toReadableStream(response);

    return {
      contentType: contentTypeResponse,
      requestId: tableCtx.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 202,
      body
    };
  }

  private getOdataAnnotationUrlPrefix(
    tableContext: TableStorageContext,
    account: string
  ): string {
    // TODO: Get protocol, host and port from Azurite server instance
    let protocol = "http";
    let host = `${DEFAULT_TABLE_SERVER_HOST_NAME}:${DEFAULT_TABLE_LISTENING_PORT}/${account}`;
    if (tableContext.request !== undefined) {
      host = `${tableContext.request.getHeader("host")}/${account}` || host;
      protocol = tableContext.request.getProtocol();
    }
    return `${protocol}://${host}`;
  }

  private getAndCheckPayloadFormat(context: TableStorageContext): string {
    const format = getPayloadFormat(context);

    if (
      format !== NO_METADATA_ACCEPT &&
      format !== MINIMAL_METADATA_ACCEPT &&
      format !== FULL_METADATA_ACCEPT
    ) {
      throw StorageErrorFactory.getAtomFormatNotSupported(context);
    }

    return format;
  }

  private getAndCheckPreferHeader(
    context: TableStorageContext
  ): string | undefined {
    const prefer = context.request!.getHeader(HeaderConstants.PREFER);
    return prefer;
  }

  private getAndCheckAccountName(context: TableStorageContext): string {
    const account = context.account;
    if (account === undefined) {
      throw StorageErrorFactory.getAccountNameEmpty(context);
    }
    return account;
  }

  private getAndCheckTableName(context: TableStorageContext): string {
    const table = context.tableName;
    if (table === undefined) {
      throw StorageErrorFactory.getTableNameEmpty(context);
    }
    return table;
  }

  private getAndCheckPartitionKey(context: TableStorageContext): string {
    const partitionKey = context.partitionKey;
    if (partitionKey === undefined) {
      throw StorageErrorFactory.getTableNameEmpty(context);
    }
    return partitionKey;
  }

  private getAndCheckRowKey(context: TableStorageContext): string {
    const rowKey = context.rowKey;
    if (rowKey === undefined) {
      throw StorageErrorFactory.getTableNameEmpty(context);
    }
    return rowKey;
  }

  private updateResponseAccept(
    context: TableStorageContext,
    accept?: string
  ): TableStorageContext {
    if (accept !== undefined) {
      context.response!.setContentType(accept);
    }
    return context;
  }

  private updateResponsePrefer(
    response: IPartialResponsePreferProperties,
    context: TableStorageContext
  ): IPartialResponsePreferProperties {
    const prefer = context.request!.getHeader(HeaderConstants.PREFER);
    if (prefer === RETURN_NO_CONTENT) {
      response.statusCode = 204;
      response.preferenceApplied = RETURN_NO_CONTENT;
    }
    if (prefer === RETURN_CONTENT || prefer === undefined) {
      response.statusCode = 201;
      response.preferenceApplied = RETURN_CONTENT;
    }
    return response;
  }
}
