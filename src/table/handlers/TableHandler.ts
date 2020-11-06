import BufferStream from "../../common/utils/BufferStream";
import { newEtag } from "../../common/utils/utils";
import TableStorageContext from "../context/TableStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import ITableHandler from "../generated/handlers/ITableHandler";
import { Entity, Table } from "../persistence/ITableMetadataStore";
import {
  DEFAULT_TABLE_LISTENING_PORT,
  DEFAULT_TABLE_SERVER_HOST_NAME,
  FULL_METADATA_ACCEPT,
  HeaderConstants,
  MINIMAL_METADATA_ACCEPT,
  NO_METADATA_ACCEPT,
  QUERY_RESULT_MAX_NUM,
  RETURN_CONTENT,
  RETURN_NO_CONTENT,
  TABLE_API_VERSION
} from "../utils/constants";
import {
  getTableOdataAnnotationsForRequest,
  updateTableOptionalOdataAnnotationsForResponse
} from "../utils/utils";
import BaseHandler from "./BaseHandler";

export default class TableHandler extends BaseHandler implements ITableHandler {
  public async batch(
    body: NodeJS.ReadableStream,
    multipartContentType: string,
    contentLength: number,
    options: Models.TableBatchOptionalParams,
    context: Context
  ): Promise<Models.TableBatchResponse> {
    const tableContext = new TableStorageContext(context);
    // TODO: Implement batch operation logic here
    return {
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 202,
      body // Use incoming request body as Batch operation response body as demo
    };
  }

  public async create(
    tableProperties: Models.TableProperties,
    options: Models.TableCreateOptionalParams,
    context: Context
  ): Promise<Models.TableCreateResponse> {
    const tableContext = new TableStorageContext(context);

    const account = tableContext.account;
    if (account === undefined) {
      throw StorageErrorFactory.getAccountNameEmpty(context);
    }

    const accept = context.request!.getHeader(HeaderConstants.ACCEPT);
    if (
      accept !== NO_METADATA_ACCEPT &&
      accept !== MINIMAL_METADATA_ACCEPT &&
      accept !== FULL_METADATA_ACCEPT
    ) {
      throw StorageErrorFactory.getAtomFormatNotSupported(context);
    }

    // Table name is in request body instead of URL
    const table = tableProperties.tableName;
    if (table === undefined) {
      throw StorageErrorFactory.getTableNameEmpty;
    }

    const tableModel: Table = {
      account,
      table,
      ...getTableOdataAnnotationsForRequest(account, table)
    };

    await this.metadataStore.createTable(context, tableModel);

    const response: Models.TableCreateResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 201
    };

    const prefer = context.request!.getHeader(HeaderConstants.PREFER);
    if (prefer === RETURN_NO_CONTENT) {
      response.statusCode = 204;
      response.preferenceApplied = RETURN_NO_CONTENT;
    }
    if (prefer === RETURN_CONTENT) {
      response.statusCode = 201;
      response.preferenceApplied = RETURN_CONTENT;
    }

    response.tableName = table;

    const urlPrefix = this.getOdataAnnotationUrlPrefix(tableContext, account);

    updateTableOptionalOdataAnnotationsForResponse(
      response,
      account,
      table,
      urlPrefix,
      accept
    );

    context.response!.setContentType(accept);
    return response;
  }

  public async query(
    options: Models.TableQueryOptionalParams,
    context: Context
  ): Promise<Models.TableQueryResponse2> {
    const tableContext = new TableStorageContext(context);

    const account = tableContext.account;
    if (account === undefined) {
      throw StorageErrorFactory.getAccountNameEmpty(context);
    }

    const accept = context.request!.getHeader("accept");
    if (
      accept !== NO_METADATA_ACCEPT &&
      accept !== MINIMAL_METADATA_ACCEPT &&
      accept !== FULL_METADATA_ACCEPT
    ) {
      throw StorageErrorFactory.getAtomFormatNotSupported(context);
    }

    const metadata = `${account}/$metadata#Tables`;

    const tableResult = await this.metadataStore.queryTable(context, account);

    const response: Models.TableQueryResponse2 = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 200,
      xMsContinuationNextTableName: options.nextTableName,
      value: []
    };

    // TODO: Get protocol in runtime
    let protocol = "http";
    let host =
      DEFAULT_TABLE_SERVER_HOST_NAME + ":" + DEFAULT_TABLE_LISTENING_PORT;
    // TODO: Get host and port from Azurite Server instance
    if (tableContext.request !== undefined) {
      host = tableContext.request.getHeader("host") as string;
      protocol = tableContext.request.getProtocol() as string;
    }

    if (tableContext.accept === NO_METADATA_ACCEPT) {
      response.value = tableResult.map(item => {
        return { tableName: item.tableName };
      });
    }

    if (tableContext.accept === MINIMAL_METADATA_ACCEPT) {
      response.odatametadata = `${protocol}://${host}/${metadata}`;
      response.value = tableResult.map(item => {
        return { tableName: item.tableName };
      });
    }

    if (tableContext.accept === FULL_METADATA_ACCEPT) {
      response.odatametadata = `${protocol}://${host}/${metadata}`;
      response.value = tableResult.map(item => {
        return {
          odatatype: item.odatatype,
          odataid: `${protocol}://${host}/${item.odataid}`,
          odataeditLink: item.odataeditLink,
          tableName: item.tableName
        };
      });
    }

    context.response!.setContentType(accept);
    return response;
  }

  public async delete(
    tablename: string,
    options: Models.TableDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteResponse> {
    const tableContext = new TableStorageContext(context);
    const accountName = tableContext.account;
    // currently the tableName is not coming through, so we take it from the table context
    await this.metadataStore.deleteTable(
      context,
      tableContext.tableName!,
      accountName!
    );
    const response: Models.TableDeleteResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 204
    };

    return response;
  }

  public async queryEntities(
    table: string,
    options: Models.TableQueryEntitiesOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesResponse> {
    const tableContext = new TableStorageContext(context);
    const tableName = tableContext.tableName;
    const accountName = tableContext.account;

    const result = await this.metadataStore.queryTableEntities(
      context,
      accountName!,
      tableName!,
      options.queryOptions!
    );

    const response: Models.TableQueryEntitiesResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 200
    };

    const responseBody = this.getResponseBodyFromQueryResultBasedOnAccept(
      tableContext.accept!,
      accountName!,
      tableContext,
      result
    );

    // Set query result
    response.value = responseBody.value;
    if (responseBody["odata.metadata"] !== undefined) {
      response.odatametadata = responseBody["odata.metadata"];
    }

    // Set x-ms-continuation-NextPartitionKey and x-ms-continuation-NextRowKey
    if (result.length > QUERY_RESULT_MAX_NUM) {
      response.xMsContinuationNextPartitionKey =
        result[QUERY_RESULT_MAX_NUM].PartitionKey;
      response.xMsContinuationNextRowKey = result[QUERY_RESULT_MAX_NUM].RowKey;
    }

    return response;
  }

  public async queryEntitiesWithPartitionAndRowKey(
    _table: string,
    _partitionKey: string,
    _rowKey: string,
    options: Models.TableQueryEntitiesWithPartitionAndRowKeyOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesWithPartitionAndRowKeyResponse> {
    // e.g
    // const tableContext = new TableStorageContext(context);
    // const accountName = tableContext.account;
    // const tableName = tableContext.tableName; // Get tableName from context
    // const partitionKey = tableContext.partitionKey!; // Get partitionKey from context
    // const rowKey = tableContext.rowKey!; // Get rowKey from context
    // return {
    //   statusCode: 200,
    //   date: tableContext.startTime,
    //   clientRequestId: "clientRequestId",
    //   requestId: "requestId",
    //   version: "version",
    //   xMsContinuationNextPartitionKey: partitionKeyFromContext,
    //   xMsContinuationNextRowKey: rowKeyFromContext,
    //   odatametadata: "odatametadata",
    //   value: [
    //     {
    //       property1: "property1" + accountName,
    //       property2: "property2" + tableName,
    //       property3: "property3"
    //     },
    //     {
    //       property1: "property1"
    //     }
    //   ]
    // };
    // TODO
    throw new NotImplementedError();
  }

  public async updateEntity(
    _table: string,
    _partitionKey: string,
    _rowKey: string,
    options: Models.TableUpdateEntityOptionalParams,
    context: Context
  ): Promise<Models.TableUpdateEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const accountName = tableContext.account;
    const tableName = tableContext.tableName!; // Get tableName from context
    const ifMatch = options.ifMatch;

    // Test if all required parameter exist
    if (
      !options.tableEntityProperties ||
      !options.tableEntityProperties.PartitionKey ||
      !options.tableEntityProperties.RowKey
    ) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }

    // Test if etag is available
    // this is considered an upsert if no etag header, an empty header is an error.
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-or-replace-entity
    if (ifMatch === "") {
      throw StorageErrorFactory.getPreconditionFailed(context);
    }

    const metadata = `${accountName}/$metadata#Tables/@Element`;
    const type = `${accountName}.Tables`;
    const id = `Tables(${tableName})`;
    const editLink = `Tables(${tableName})`;

    const updateEtag = newEtag();

    // Entity, which is used to update an existing entity
    const entity: Entity = {
      PartitionKey: options.tableEntityProperties.PartitionKey,
      RowKey: options.tableEntityProperties.RowKey,
      properties: options.tableEntityProperties,
      lastModifiedTime: context.startTime!,
      odatametadata: metadata,
      odatatype: type,
      odataid: id,
      odataeditLink: editLink,
      eTag: updateEtag
    };

    if (ifMatch !== undefined) {
      // Update entity
      await this.metadataStore.updateTableEntity(
        context,
        tableName,
        accountName!,
        entity,
        ifMatch!
      );
    } else {
      // Upsert the entity
      const exists = await this.metadataStore.queryTableEntitiesWithPartitionAndRowKey(
        context,
        tableName,
        accountName!,
        options.tableEntityProperties.PartitionKey,
        options.tableEntityProperties.RowKey
      );

      if (exists !== null) {
        // entity exists so we update and force with "*" etag
        await this.metadataStore.updateTableEntity(
          context,
          tableName,
          accountName!,
          entity,
          "*"
        );
      } else {
        await this.metadataStore.insertTableEntity(
          context,
          tableName,
          accountName!,
          entity
        );
      }
    }
    // Response definition
    const response: Models.TableUpdateEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      eTag: updateEtag,
      statusCode: 204
    };

    return response;
  }

  public async mergeEntity(
    _table: string,
    _partitionKey: string,
    _rowKey: string,
    options: Models.TableMergeEntityOptionalParams,
    context: Context
  ): Promise<Models.TableMergeEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const accountName = tableContext.account;
    const tableName = tableContext.tableName;
    const partitionKey = tableContext.partitionKey!;
    const rowKey = tableContext.rowKey!;

    if (
      !options.tableEntityProperties ||
      !options.tableEntityProperties.PartitionKey ||
      !options.tableEntityProperties.RowKey
    ) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }

    const existingEntity = await this.metadataStore.queryTableEntitiesWithPartitionAndRowKey(
      context,
      tableName!,
      accountName!,
      partitionKey,
      rowKey
    );
    let etagValue = "*";

    if (existingEntity !== null) {
      const mergeEntity: Entity = {
        PartitionKey: options.tableEntityProperties.PartitionKey,
        RowKey: options.tableEntityProperties.RowKey,
        properties: options.tableEntityProperties,
        lastModifiedTime: context.startTime!,
        eTag: etagValue,
        odatametadata: "", // TODO
        odatatype: "", // TODO,
        odataid: "", // TODO,
        odataeditLink: "" // TODO
      };

      etagValue = await this.metadataStore.mergeTableEntity(
        context,
        tableName!,
        accountName!,
        mergeEntity,
        etagValue,
        partitionKey,
        rowKey
      );
    } else {
      const entity: Entity = {
        PartitionKey: options.tableEntityProperties.PartitionKey,
        RowKey: options.tableEntityProperties.RowKey,
        properties: options.tableEntityProperties,
        lastModifiedTime: context.startTime!,
        eTag: etagValue,
        odatametadata: "", // TODO
        odatatype: "", // TODO,
        odataid: "", // TODO,
        odataeditLink: "" // TODO
      };

      await this.metadataStore.insertTableEntity(
        context,
        tableName!,
        accountName!,
        entity
      );
    }

    const response: Models.TableMergeEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 204,
      eTag: etagValue
    };

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

  public async deleteEntity(
    _table: string,
    _partitionKey: string,
    _rowKey: string,
    ifMatch: string,
    options: Models.TableDeleteEntityOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const accountName = tableContext.account;
    const partitionKey = tableContext.partitionKey!; // Get partitionKey from context
    const rowKey = tableContext.rowKey!; // Get rowKey from context

    if (!partitionKey || !rowKey) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }
    if (ifMatch === "" || ifMatch === undefined) {
      throw StorageErrorFactory.getPreconditionFailed(context);
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

  public async insertEntity(
    _tableName: string,
    options: Models.TableInsertEntityOptionalParams,
    context: Context
  ): Promise<Models.TableInsertEntityResponse> {
    const tableContext = new TableStorageContext(context);
    const accountName = tableContext.account;
    const tableName = tableContext.tableName!; // Get tableName from context

    if (
      !options.tableEntityProperties ||
      !options.tableEntityProperties.PartitionKey ||
      !options.tableEntityProperties.RowKey
    ) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }

    const metadata = `${accountName}/$metadata#Tables/@Element`;
    const type = `${accountName}.${tableName}`;
    const id =
      `${tableName}` +
      `(PartitionKey='${options.tableEntityProperties.PartitionKey}',` +
      `RowKey='${options.tableEntityProperties.RowKey}')`;
    const editLink = id;

    const entity: Entity = {
      PartitionKey: options.tableEntityProperties.PartitionKey,
      RowKey: options.tableEntityProperties.RowKey,
      properties: options.tableEntityProperties,
      lastModifiedTime: context.startTime!,
      eTag: newEtag(),
      odatametadata: metadata, // Here we store value without protocol and host
      odatatype: type,
      odataid: id,
      odataeditLink: editLink
    };

    await this.metadataStore.insertTableEntity(
      context,
      tableName,
      accountName!,
      entity
    );

    const response: Models.TableInsertEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableContext.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 201
    };

    const accept = tableContext.accept;

    // Set contentType in response according to accept
    if (
      accept !== NO_METADATA_ACCEPT &&
      accept !== MINIMAL_METADATA_ACCEPT &&
      accept !== FULL_METADATA_ACCEPT
    ) {
      throw StorageErrorFactory.getAtomFormatNotSupported(context);
    }

    response.contentType = "application/json";
    const body = {} as any;

    if (context.request!.getHeader("Prefer") === RETURN_NO_CONTENT) {
      response.statusCode = 204;
      response.preferenceApplied = RETURN_NO_CONTENT;
    }

    if (context.request!.getHeader("Prefer") === RETURN_CONTENT) {
      response.statusCode = 201;
      response.preferenceApplied = "return-content";

      let protocol = "http";
      let host =
        DEFAULT_TABLE_SERVER_HOST_NAME + ":" + DEFAULT_TABLE_LISTENING_PORT;
      if (tableContext.request !== undefined) {
        host = tableContext.request.getHeader("host") as string;
        protocol = tableContext.request.getProtocol() as string;
      }

      if (accept === MINIMAL_METADATA_ACCEPT) {
        body["odata.metadata"] = `${protocol}://${host}/` + metadata;
      }

      if (accept === FULL_METADATA_ACCEPT) {
        body["odata.metadata"] = `${protocol}://${host}/` + metadata;
        body["odata.type"] = type;
        body["body.id"] = `${protocol}://${host}/` + id;
        body["odata.etag"] = entity.eTag;
        body["odata.editLink"] = editLink;
      }

      for (const key of Object.keys(entity.properties)) {
        body[key] = entity.properties[key];
      }

      response.body = new BufferStream(Buffer.from(JSON.stringify(body)));
    }
    return response;
  }

  public async getAccessPolicy(
    table: string,
    options: Models.TableGetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableGetAccessPolicyResponse> {
    // e.g
    // const tableContext = new TableStorageContext(context);
    // const accountName = tableContext.account;
    // const tableName = tableContext.tableName; // Get tableName from context
    // TODO
    throw new NotImplementedError();
  }

  public async setAccessPolicy(
    table: string,
    options: Models.TableSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableSetAccessPolicyResponse> {
    // e.g
    // const tableContext = new TableStorageContext(context);
    // const accountName = tableContext.account;
    // const tableName = tableContext.tableName; // Get tableName from context
    // TODO
    throw new NotImplementedError();
  }

  private getResponseBodyFromQueryResultBasedOnAccept(
    accept: string,
    accountName: string,
    tableContext: Context,
    queryResult: { [propertyName: string]: any }[]
  ) {
    let protocol = "http";
    let host =
      DEFAULT_TABLE_SERVER_HOST_NAME + ":" + DEFAULT_TABLE_LISTENING_PORT;

    if (tableContext.request !== undefined) {
      host = tableContext.request.getHeader("host") as string;
      protocol = tableContext.request.getProtocol() as string;
    }

    const resultWithMetaData: { [propertyName: string]: any }[] = [];
    const responseBody: { [propertyName: string]: any } = {};

    switch (accept) {
      case MINIMAL_METADATA_ACCEPT: {
        // Add odata.metadata
        (responseBody as any)["odata.metadata"] =
          `${protocol}://${host}/` + queryResult[0].odataMetadata;
        for (const entity of queryResult) {
          const filteredEntity = {};
          for (const key of Object.keys(entity)) {
            // Only need metadata and properties' odata type
            if (
              key === "odataMetadata" ||
              key === "odataType" ||
              key === "odataId" ||
              key === "eTag" ||
              key === "odataEditLink"
            ) {
              continue;
            }
            // Also add odataType to each field
            (filteredEntity as any)[key] = entity[key];
          }

          resultWithMetaData.push(filteredEntity);
        }
        (responseBody as any).value = resultWithMetaData;
        break;
      }
      case FULL_METADATA_ACCEPT: {
        // Add odata.metadata
        (responseBody as any)["odata.metadata"] = queryResult[0].odataMetadata;
        for (const entity of queryResult) {
          const filteredEntity = {};
          for (const key of Object.keys(entity)) {
            // Remove odataMetadata of each entity
            if (key === "odataMetadata") {
              continue;
            }
            (filteredEntity as any)[key] = entity[key];
          }

          // Add Timestamp@odata.type
          (filteredEntity as any)["Timestamp@odata.type"] = "Edm.DateTime";

          // Solve the name inconsistency of the response and entity
          (filteredEntity as any)[
            "odata.type"
          ] = (filteredEntity as any).odataType;
          delete (filteredEntity as any).odataType;

          (filteredEntity as any)["odata.id"] =
            `${protocol}://${host}/` + (filteredEntity as any).odataId;
          delete (filteredEntity as any).odataId;

          (filteredEntity as any)["odata.etag"] = (filteredEntity as any).eTag;
          delete (filteredEntity as any).eTag;

          (filteredEntity as any)[
            "odata.editLink"
          ] = (filteredEntity as any).odataEditLink;
          delete (filteredEntity as any).odataEditLink;

          // Add processed entity back
          resultWithMetaData.push(filteredEntity);
        }
        (responseBody as any).value = resultWithMetaData;
        break;
      }
      default: {
        for (const entity of queryResult) {
          const filteredEntity = {};
          for (const key of Object.keys(entity)) {
            // Don't need metadata and properties' odata type
            if (
              key === "odataMetadata" ||
              key === "odataType" ||
              key === "odataId" ||
              key === "eTag" ||
              key === "odataEditLink" ||
              key.indexOf("@odata.type") > 0
            ) {
              continue;
            }
            (filteredEntity as any)[key] = entity[key];
          }

          resultWithMetaData.push(filteredEntity);
        }
        (responseBody as any).value = resultWithMetaData;
        break;
      }
    }
    return responseBody;
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
}
