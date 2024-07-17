import toReadableStream from "to-readable-stream";

import BufferStream from "../../common/utils/BufferStream";
import {
  isEtagValid,
  getUTF8ByteSize,
  newTableEntityEtag
} from "../utils/utils";
import TableBatchOrchestrator from "../batch/TableBatchOrchestrator";
import TableBatchUtils from "../batch/TableBatchUtils";
import TableStorageContext from "../context/TableStorageContext";
import { NormalizedEntity } from "../entity/NormalizedEntity";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import ITableHandler from "../generated/handlers/ITableHandler";
import { Entity, Table } from "../persistence/ITableMetadataStore";
import {
  DEFAULT_KEY_MAX_LENGTH,
  BODY_SIZE_MAX,
  DEFAULT_TABLE_LISTENING_PORT,
  DEFAULT_TABLE_SERVER_HOST_NAME,
  FULL_METADATA_ACCEPT,
  HeaderConstants,
  MINIMAL_METADATA_ACCEPT,
  NO_METADATA_ACCEPT,
  RETURN_CONTENT,
  RETURN_NO_CONTENT,
  TABLE_API_VERSION,
  TABLE_SERVICE_PERMISSION,
  ODATA_TYPE,
  ENTITY_SIZE_MAX
} from "../utils/constants";
import {
  getEntityOdataAnnotationsForResponse,
  getPayloadFormat,
  getTableOdataAnnotationsForResponse,
  getTablePropertiesOdataAnnotationsForResponse,
  updateTableOptionalOdataAnnotationsForResponse,
  validateTableName
} from "../utils/utils";
import BaseHandler from "./BaseHandler";
import { EdmType, getEdmType } from "../entity/IEdmType";
import { truncatedISO8061Date } from "../../common/utils/utils";

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
    // Table name is in request body instead of URL
    const table = tableProperties.tableName;
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
    this.checkBodyLimit(context, context.request?.getBody());

    // currently unable to use checking functions as the partitionKey
    // and rowKey are not coming through the context.
    // const partitionKey = this.getAndCheckPartitionKey(tableContext);
    // const rowKey = this.getAndCheckRowKey(tableContext);
    if (
      options.tableEntityProperties == undefined ||
      !options.tableEntityProperties ||
      // rowKey and partitionKey may be empty string
      options.tableEntityProperties.PartitionKey === null ||
      options.tableEntityProperties.PartitionKey == undefined ||
      options.tableEntityProperties.RowKey === null ||
      options.tableEntityProperties.RowKey === undefined
    ) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }

    // check that key properties are valid
    this.validateKey(context, options.tableEntityProperties.PartitionKey);
    this.validateKey(context, options.tableEntityProperties.RowKey);

    this.checkProperties(context, options.tableEntityProperties);

    // need to remove the etags from the properties to avoid errors
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    options.tableEntityProperties = this.removeEtagProperty(
      options.tableEntityProperties
    );

    const entity: Entity = this.createPersistedEntity(
      context,
      options,
      options.tableEntityProperties?.PartitionKey,
      options.tableEntityProperties?.RowKey
    );
    let normalizedEntity;
    try {
      normalizedEntity = new NormalizedEntity(entity);
      normalizedEntity.normalize();
    } catch (e: any) {
      this.logger.error(
        `TableHandler:insertEntity() ${e.name} ${JSON.stringify(e.stack)}`,
        context.contextID
      );
      throw StorageErrorFactory.getInvalidInput(context);
    }

    await this.metadataStore.insertTableEntity(
      context,
      table,
      account,
      entity,
      tableContext.batchId
    );

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
        options.tableEntityProperties?.PartitionKey,
        options.tableEntityProperties?.RowKey,
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
      const rawResponse = normalizedEntity.toResponseString(accept, body);
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

  private createPersistedEntity(
    context: Context,
    options:
      | Models.TableMergeEntityOptionalParams
      | Models.TableInsertEntityOptionalParams
      | Models.TableUpdateEntityOptionalParams,
    partitionKey: string,
    rowKey: string
  ) {
    const modTime = truncatedISO8061Date(context.startTime!, true, true);
    const eTag = newTableEntityEtag(modTime);

    const entity: Entity = {
      PartitionKey: partitionKey,
      RowKey: rowKey,
      properties:
        options.tableEntityProperties === undefined
          ? {}
          : options.tableEntityProperties,
      lastModifiedTime: modTime,
      eTag
    };
    return entity;
  }

  private static getAndCheck(
    key: string | undefined,
    getFromContext: () => string,
    contextForThrow: Context
  ): string {
    if (key !== undefined) {
      return key;
    }

    const fromContext = getFromContext();
    if (fromContext === undefined) {
      throw StorageErrorFactory.getPropertiesNeedValue(contextForThrow);
    }

    return fromContext;
  }

  private static getAndCheckKeys(
    partitionKey: string | undefined,
    rowKey: string | undefined,
    tableContext: TableStorageContext,
    contextForThrow: Context
  ) {
    partitionKey = TableHandler.getAndCheck(
      partitionKey,
      () => tableContext.partitionKey!,
      contextForThrow
    );
    rowKey = TableHandler.getAndCheck(
      rowKey,
      () => tableContext.rowKey!,
      contextForThrow
    );

    return [partitionKey, rowKey];
  }

  // TODO: Create data structures to hold entity properties and support serialize, merge, deserialize, filter
  // Note: Batch is using the partition key and row key args, handler receives these values from middleware via
  // context
  public async updateEntity(
    _table: string,
    partitionKey: string | undefined,
    rowKey: string | undefined,
    options: Models.TableUpdateEntityOptionalParams,
    context: Context
  ): Promise<Models.TableUpdateEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const account = this.getAndCheckAccountName(tableContext);
    const table = this.getAndCheckTableName(tableContext);
    this.checkEntityLimit(context, context.request?.getBody());

    [partitionKey, rowKey] = TableHandler.getAndCheckKeys(
      partitionKey,
      rowKey,
      tableContext,
      context
    );

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

    this.checkProperties(context, options.tableEntityProperties);

    // Test if etag is available
    // this is considered an upsert if no etag header, an empty header is an error.
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-or-replace-entity
    if (ifMatch === "") {
      throw StorageErrorFactory.getPreconditionFailed(context);
    }
    if (options?.ifMatch && options.ifMatch !== "*") {
      if (isEtagValid(options.ifMatch)) {
        throw StorageErrorFactory.getInvalidInput(context);
      }
    }
    // check that key properties are valid
    this.validateKey(context, partitionKey);
    this.validateKey(context, rowKey);
    options.tableEntityProperties = this.removeEtagProperty(
      options.tableEntityProperties
    );

    const entity: Entity = this.createPersistedEntity(
      context,
      options,
      partitionKey,
      rowKey
    );

    let normalizedEntity;
    try {
      normalizedEntity = new NormalizedEntity(entity);
      normalizedEntity.normalize();
    } catch (e: any) {
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
      ifMatch,
      tableContext.batchId
    );

    // Response definition
    const response: Models.TableUpdateEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      eTag: entity.eTag,
      statusCode: 204
    };

    return response;
  }

  public async mergeEntity(
    _table: string,
    partitionKey: string | undefined,
    rowKey: string | undefined,
    options: Models.TableMergeEntityOptionalParams,
    context: Context
  ): Promise<Models.TableMergeEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const account = this.getAndCheckAccountName(tableContext);
    const table = this.getAndCheckTableName(tableContext);
    this.checkEntityLimit(context, context.request?.getBody());

    [partitionKey, rowKey] = TableHandler.getAndCheckKeys(
      partitionKey,
      rowKey,
      tableContext,
      context
    );

    this.checkMergeRequest(options, context, partitionKey, rowKey);
    options.tableEntityProperties = this.removeEtagProperty(
      options.tableEntityProperties
    );

    const entity: Entity = this.createPersistedEntity(
      context,
      options,
      partitionKey,
      rowKey
    );
    let normalizedEntity;
    try {
      normalizedEntity = new NormalizedEntity(entity);
      normalizedEntity.normalize();
    } catch (e: any) {
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
      options.ifMatch,
      tableContext.batchId
    );

    const response: Models.TableMergeEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 204,
      eTag: entity.eTag
    };

    return response;
  }

  /**
   * Check that the properties are valid on merge request
   *
   * @private
   * @param {Models.TableMergeEntityOptionalParams} options
   * @param {Context} context
   * @param {string} partitionKey
   * @param {string} rowKey
   * @memberof TableHandler
   */
  private checkMergeRequest(
    options: Models.TableMergeEntityOptionalParams,
    context: Context,
    partitionKey: string,
    rowKey: string
  ) {
    // some SDKs, like Azure Cosmos Table do not always send properties
    // and we might merge just row and partition keys like upsert
    // this caused issues and has been removed for now.
    // if (!options.tableEntityProperties) {
    //   throw StorageErrorFactory.getPropertiesNeedValue(context);
    // }
    if (options.tableEntityProperties !== undefined) {
      if (
        options.tableEntityProperties.PartitionKey !== partitionKey ||
        options.tableEntityProperties.RowKey !== rowKey
      ) {
        this.logger.warn(
          `TableHandler:mergeEntity() Incoming PartitionKey:${partitionKey} RowKey:${rowKey} in URL parameters don't align with entity body PartitionKey:${options.tableEntityProperties.PartitionKey} RowKey:${options.tableEntityProperties.RowKey}.`
        );
      }
      this.checkProperties(context, options.tableEntityProperties);
    }
    this.checkMergeIfMatch(options, context);
    // check that key properties are valid
    this.validateKey(context, partitionKey);
    this.validateKey(context, rowKey);
  }

  /**
   * Check that the ifMatch header is valid on merge request
   *
   * @private
   * @param {Models.TableMergeEntityOptionalParams} options
   * @param {Context} context
   * @memberof TableHandler
   */
  private checkMergeIfMatch(
    options: Models.TableMergeEntityOptionalParams,
    context: Context
  ) {
    if (options?.ifMatch && options.ifMatch !== "*" && options.ifMatch !== "") {
      if (isEtagValid(options.ifMatch)) {
        throw StorageErrorFactory.getInvalidOperation(context);
      }
    }
  }

  public async deleteEntity(
    _table: string,
    partitionKey: string | undefined,
    rowKey: string | undefined,
    ifMatch: string,
    options: Models.TableDeleteEntityOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const accountName = tableContext.account;

    [partitionKey, rowKey] = TableHandler.getAndCheckKeys(
      partitionKey,
      rowKey,
      tableContext,
      context
    );

    if (ifMatch === "" || ifMatch === undefined) {
      throw StorageErrorFactory.getPreconditionFailed(context);
    }
    if (ifMatch !== "*" && isEtagValid(ifMatch)) {
      throw StorageErrorFactory.getInvalidInput(context);
    }
    // currently the props are not coming through as args, so we take them from the table context
    await this.metadataStore.deleteTableEntity(
      context,
      tableContext.tableName!,
      accountName!,
      partitionKey,
      rowKey,
      ifMatch,
      tableContext.batchId
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
    this.checkBodyLimit(context, context.request?.getBody());

    const [result, nextPartitionKey, nextRowKey] =
      await this.metadataStore.queryTableEntities(
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

      const normalizedEntity = new NormalizedEntity(element);
      entities.push(
        normalizedEntity.toResponseString(accept, entity, selectSet)
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
    partitionKey: string | undefined,
    rowKey: string | undefined,
    options: Models.TableQueryEntitiesWithPartitionAndRowKeyOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesWithPartitionAndRowKeyResponse> {
    const tableContext = new TableStorageContext(context);
    const account = this.getAndCheckAccountName(tableContext);
    const table = _table ? _table : this.getAndCheckTableName(tableContext);

    [partitionKey, rowKey] = TableHandler.getAndCheckKeys(
      partitionKey,
      rowKey,
      tableContext,
      context
    );

    const accept = this.getAndCheckPayloadFormat(tableContext);

    const entity =
      await this.metadataStore.queryTableEntitiesWithPartitionAndRowKey(
        context,
        table,
        account,
        partitionKey,
        rowKey,
        tableContext.batchId
      );

    if (entity === undefined || entity === null) {
      throw StorageErrorFactory.getEntityNotFound(context);
    }

    const response: Models.TableQueryEntitiesWithPartitionAndRowKeyResponse = {
      statusCode: 200,
      date: tableContext.startTime,
      clientRequestId: options.requestId,
      requestId: context.contextID,
      eTag: entity.eTag,
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

    const normalizedEntity = new NormalizedEntity(entity);
    const rawResponse = normalizedEntity.toResponseString(
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
    this.checkBodyLimit(context, context.request?.getBody());

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

    if (contentLength && contentLength > BODY_SIZE_MAX) {
      throw StorageErrorFactory.getRequestBodyTooLarge(context);
    } else {
      this.checkBodyLimit(context, context.request?.getBody());
    }

    const contentTypeResponse = tableCtx.request
      ?.getHeader("content-type")
      ?.replace("batch", "batchresponse");
    const tableBatchManager = new TableBatchOrchestrator(
      tableCtx,
      this,
      this.metadataStore
    );

    const requestBody = await TableBatchUtils.StreamToString(body);
    this.logger.debug(
      `TableHandler:batch() Raw request string is ${JSON.stringify(
        requestBody
      )}`,
      context.contextID
    );

    const response =
      await tableBatchManager.processBatchRequestAndSerializeResponse(
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

  /**
   * Checks if key is valid based on rules outlined here:
   * https://docs.microsoft.com/en-us/rest/api/storageservices/Understanding-the-Table-Service-Data-Model#characters-disallowed-in-key-fields
   * Checks that key length is less than 1Kib (1024 chars)
   * Checks for invalid chars
   * @private
   * @param {string} key
   * @return {*}  {boolean}
   * @memberof TableHandler
   */
  private validateKey(context: Context, key: string) {
    // key is a string value that may be up to 1 KiB in size.
    // although a little arbitrary, for performance and
    // generally a better idea, choosing a shorter length
    if (key !== undefined && key.length > DEFAULT_KEY_MAX_LENGTH) {
      throw StorageErrorFactory.getInvalidInput(context);
    }
    const match = key.match(/[\u0000-\u001f\u007f-\u009f\/\\\#\?]+/);
    if (match !== null && match.length > 0) {
      throw StorageErrorFactory.getInvalidInput(context);
    }
  }

  /**
   * Checks that properties are valid according to rules given here:
   * https://docs.microsoft.com/en-us/rest/api/storageservices/understanding-the-table-service-data-model#property-types
   *
   * @private
   * @param {Context} context
   * @param {{
   *       [propertyName: string]: any;
   *     }} properties
   * @memberof TableHandler
   */
  private checkProperties(
    context: Context,
    properties: {
      [propertyName: string]: any;
    }
  ) {
    for (const prop in properties) {
      if (properties.hasOwnProperty(prop)) {
        if (
          null !== properties[prop] &&
          undefined !== properties[prop].length
        ) {
          const typeKey = `${prop}${ODATA_TYPE}`;
          let type;
          if (properties[typeKey]) {
            type = getEdmType(properties[typeKey]);
          }
          if (type === EdmType.Binary) {
            if (Buffer.from(properties[prop], "base64").length > 64 * 1024) {
              throw StorageErrorFactory.getPropertyValueTooLargeError(context);
            }
          } else if (properties[prop].length > 32 * 1024) {
            throw StorageErrorFactory.getPropertyValueTooLargeError(context);
          } else if (
            properties[prop] === undefined ||
            properties[prop] === ""
          ) {
            const propertyType = properties[`${prop}${ODATA_TYPE}`];
            if (propertyType !== undefined && propertyType === "Edm.DateTime") {
              throw StorageErrorFactory.getInvalidInput(context);
            }
          }
        }
      }
    }
  }

  /**
   * Checks the size of the body against service limit as per documentation
   * https://docs.microsoft.com/en-us/troubleshoot/azure/general/request-body-large
   *
   * @private
   * @param {Context} context
   * @param {string} body
   * @memberof TableHandler
   */
  private checkBodyLimit(context: Context, body: string | undefined) {
    if (undefined !== body && getUTF8ByteSize(body) > BODY_SIZE_MAX) {
      throw StorageErrorFactory.getRequestBodyTooLarge(context);
    }
  }

  private checkEntityLimit(context: Context, body: string | undefined) {
    if (undefined !== body && getUTF8ByteSize(body) > ENTITY_SIZE_MAX) {
      throw StorageErrorFactory.getEntityTooLarge(context);
    }
  }

  /**
   * remove the etag property to avoid duplicate odata.etag error
   *
   * @private
   * @param {{
   *       [propertyName: string]: any;
   *     }} tableEntityProperties
   * @return {*}  {({ [propertyName: string]: any } | undefined)}
   * @memberof TableHandler
   */
  private removeEtagProperty(
    tableEntityProperties:
      | {
          [propertyName: string]: any;
        }
      | undefined
  ): { [propertyName: string]: any } | undefined {
    if (tableEntityProperties) {
      delete tableEntityProperties["odata.etag"];
    }
    return tableEntityProperties;
  }
}
