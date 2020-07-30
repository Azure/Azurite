import BufferStream from "../../common/utils/BufferStream";
import TableStorageContext from "../context/TableStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import ITableHandler from "../generated/handlers/ITableHandler";
import { IEntity, TableModel } from "../persistence/ITableMetadataStore";
import {
  DEFAULT_TABLE_LISTENING_PORT,
  DEFAULT_TABLE_SERVER_HOST_NAME,
  FULL_METADATA_ACCEPT,
  MINIMAL_METADATA_ACCEPT,
  NO_METADATA_ACCEPT,
  RETURN_CONTENT,
  RETURN_NO_CONTENT,
  TABLE_API_VERSION
} from "../utils/constants";
import { newEtag } from "../utils/utils";
import BaseHandler from "./BaseHandler";

export default class TableHandler extends BaseHandler implements ITableHandler {
  public async create(
    tableProperties: Models.TableProperties,
    options: Models.TableCreateOptionalParams,
    context: Context
  ): Promise<Models.TableCreateResponse> {
    const tableCtx = new TableStorageContext(context);
    const accountName = tableCtx.account;

    const accept = context.request!.getHeader("accept");

    if (
      accept !== NO_METADATA_ACCEPT &&
      accept !== MINIMAL_METADATA_ACCEPT &&
      accept !== FULL_METADATA_ACCEPT
    ) {
      throw StorageErrorFactory.getContentTypeNotSupported(context);
    }

    if (accountName === undefined) {
      throw StorageErrorFactory.getAccountNameEmpty(context);
    }

    // Here table name is in request body, not in url
    const tableName = tableProperties.tableName;
    if (tableName === undefined) {
      throw StorageErrorFactory.getTableNameEmpty;
    }

    const metadata = `${accountName}/$metadata#Tables/@Element`;
    const type = `${accountName}.Tables`;
    const id = `${accountName}/Tables(${tableName})`;
    const editLink = `Tables(${tableName})`;

    const table: TableModel = {
      account: accountName,
      tableName,
      odatametadata: metadata,
      odatatype: type,
      odataid: id,
      odataeditLink: editLink
    };

    await this.metadataStore.createTable(context, table);

    const response: Models.TableCreateResponse = {
      clientRequestId: options.requestId,
      requestId: tableCtx.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 204
    };

    if (context.request!.getHeader("Prefer") === RETURN_NO_CONTENT) {
      response.statusCode = 204;
      response.preferenceApplied = RETURN_NO_CONTENT;
    }

    if (context.request!.getHeader("Prefer") === RETURN_CONTENT) {
      response.statusCode = 201;
      response.preferenceApplied = "return-content";
    }

    let protocol = "http";
    let host =
      DEFAULT_TABLE_SERVER_HOST_NAME + ":" + DEFAULT_TABLE_LISTENING_PORT;
    // TODO: Get host and port from Azurite Server instance
    if (tableCtx.request !== undefined) {
      host = tableCtx.request.getHeader("host") as string;
      protocol = tableCtx.request.getProtocol() as string;
    }

    if (tableCtx.accept === NO_METADATA_ACCEPT) {
      response.tableName = tableName;
    }

    if (tableCtx.accept === MINIMAL_METADATA_ACCEPT) {
      response.tableName = tableName;
      response.odatametadata = `${protocol}://${host}/${metadata}`;
    }

    if (tableCtx.accept === FULL_METADATA_ACCEPT) {
      response.tableName = tableName;
      response.odatametadata = `${protocol}://${host}/${metadata}`;
      response.odatatype = type;
      response.odataid = `${protocol}://${host}/${id}`;
      response.odataeditLink = editLink;
    }

    context.response!.setContentType(accept);
    return response;
  }

  public async query(
    options: Models.TableQueryOptionalParams,
    context: Context
  ): Promise<Models.TableQueryResponse2> {
    // TODO
    // e.g
    // return {
    //   statusCode: 200,
    //   clientRequestId: "clientRequestId",
    //   requestId: "requestId",
    //   version: "version",
    //   xMsContinuationNextTableName: "xMsContinuationNextTableName",
    //   odatametadata: "odatametadata",
    //   value: [
    //     {
    //       tableName: "tableName",
    //       odatatype: "odatatype",
    //       odataid: "odataid",
    //       odataeditLink: "odataeditLink"
    //     }
    //   ]
    // };
    throw new NotImplementedError();
  }

  public async delete(
    tablename: string,
    options: Models.TableDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteResponse> {
    const tableCtx = new TableStorageContext(context);
    const accountName = tableCtx.account;
    // currently the tableName is not coming through, so we take it from the table context
    await this.metadataStore.deleteTable(
      context,
      tableCtx.tableName!,
      accountName!
    );
    const response: Models.TableDeleteResponse = {
      clientRequestId: options.requestId,
      requestId: tableCtx.contextID,
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
    // e.g
    // const tableCtx = new TableStorageContext(context);
    // const accountName = tableCtx.account;
    // const tableName = tableCtx.tableName; // Get tableName from context
    // return {
    //   statusCode: 200,
    //   date: tableCtx.startTime,
    //   clientRequestId: "clientRequestId",
    //   requestId: "requestId",
    //   version: "version",
    //   xMsContinuationNextPartitionKey: "xMsContinuationNextPartitionKey",
    //   xMsContinuationNextRowKey: "xMsContinuationNextRowKey",
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

  public async queryEntitiesWithPartitionAndRowKey(
    _table: string,
    _partitionKey: string,
    _rowKey: string,
    options: Models.TableQueryEntitiesWithPartitionAndRowKeyOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesWithPartitionAndRowKeyResponse> {
    // e.g
    // const tableCtx = new TableStorageContext(context);
    // const accountName = tableCtx.account;
    // const tableName = tableCtx.tableName; // Get tableName from context
    // const partitionKey = tableCtx.partitionKey!; // Get partitionKey from context
    // const rowKey = tableCtx.rowKey!; // Get rowKey from context
    // return {
    //   statusCode: 200,
    //   date: tableCtx.startTime,
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
    const tableCtx = new TableStorageContext(context);
    const accountName = tableCtx.account;
    const tableName = tableCtx.tableName!; // Get tableName from context
    const partitionKey = tableCtx.partitionKey!; // Get partitionKey from context
    const rowKey = tableCtx.rowKey!; // Get rowKey from context

    if (!options.tableEntityProperties || !partitionKey || !rowKey) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }

    if (
      !options.tableEntityProperties ||
      !options.tableEntityProperties.PartitionKey ||
      !options.tableEntityProperties.RowKey
    ) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }

    const entity: IEntity = {
      PartitionKey: options.tableEntityProperties.PartitionKey,
      RowKey: options.tableEntityProperties.RowKey,
      properties: options.tableEntityProperties,
      lastModifiedTime: context.startTime!,
      eTag: newEtag()
    };

    await this.metadataStore.updateTableEntity(
      context,
      tableName,
      accountName!,
      entity
    );

    const response: Models.TableUpdateEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableCtx.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      eTag: newEtag(),
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
    // e.g
    // const tableCtx = new TableStorageContext(context);
    // const accountName = tableCtx.account;
    // const tableName = tableCtx.tableName; // Get tableName from context
    // const partitionKey = tableCtx.partitionKey!; // Get partitionKey from context
    // const rowKey = tableCtx.rowKey!; // Get rowKey from context
    // const entity = options.tableEntityProperties!;
    // return {
    //   statusCode: 204,
    //   date: tableCtx.startTime,
    //   clientRequestId: "clientRequestId",
    //   requestId: "requestId",
    //   version: "version"
    // };
    // TODO
    throw new NotImplementedError();
  }

  public async deleteEntity(
    _table: string,
    _partitionKey: string,
    _rowKey: string,
    ifMatch: string,
    options: Models.TableDeleteEntityOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteEntityResponse> {
    const tableCtx = new TableStorageContext(context);
    const accountName = tableCtx.account;
    const partitionKey = tableCtx.partitionKey!; // Get partitionKey from context
    const rowKey = tableCtx.rowKey!; // Get rowKey from context

    if (!partitionKey || !rowKey) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }
    if (ifMatch === "" || ifMatch === undefined) {
      throw StorageErrorFactory.getPreconditionFailed(context);
    }
    // currently the props are not coming through as args, so we take them from the table context
    await this.metadataStore.deleteTableEntity(
      context,
      tableCtx.tableName!,
      accountName!,
      partitionKey,
      rowKey,
      ifMatch
    );

    return {
      statusCode: 204,
      date: tableCtx.startTime,
      clientRequestId: options.requestId,
      requestId: tableCtx.contextID,
      version: TABLE_API_VERSION
    };
  }

  public async insertEntity(
    _tableName: string,
    options: Models.TableInsertEntityOptionalParams,
    context: Context
  ): Promise<Models.TableInsertEntityResponse> {
    const tableCtx = new TableStorageContext(context);
    const accountName = tableCtx.account;
    const tableName = tableCtx.tableName!; // Get tableName from context

    if (
      !options.tableEntityProperties ||
      !options.tableEntityProperties.PartitionKey ||
      !options.tableEntityProperties.RowKey
    ) {
      throw StorageErrorFactory.getPropertiesNeedValue(context);
    }

    const entity: IEntity = {
      PartitionKey: options.tableEntityProperties.PartitionKey,
      RowKey: options.tableEntityProperties.RowKey,
      properties: options.tableEntityProperties,
      lastModifiedTime: context.startTime!,
      eTag: newEtag()
    };

    // TODO: Move logic to get host into utility methods
    let protocol = "http";
    let host =
      DEFAULT_TABLE_SERVER_HOST_NAME + ":" + DEFAULT_TABLE_LISTENING_PORT;
    if (tableCtx.request !== undefined) {
      host = tableCtx.request.getHeader("host") as string;
      protocol = tableCtx.request.getProtocol() as string;
    }

    const metadata = `${protocol}://${host}/${accountName}/$metadata#Tables/@Element`;
    const type = `${accountName}.Tables`;
    const id = `${protocol}://${host}/Tables(${tableName})`;
    const editLink = `Tables(${tableName})`;

    await this.metadataStore.insertTableEntity(
      context,
      tableName,
      accountName!,
      entity
    );

    const response: Models.TableInsertEntityResponse = {
      clientRequestId: options.requestId,
      requestId: tableCtx.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode: 201
    };

    const accept = tableCtx.accept;

    // Set contentType in response according to accept
    if (
      accept !== NO_METADATA_ACCEPT &&
      accept !== MINIMAL_METADATA_ACCEPT &&
      accept !== FULL_METADATA_ACCEPT
    ) {
      throw StorageErrorFactory.getContentTypeNotSupported(context);
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

      if (accept === MINIMAL_METADATA_ACCEPT) {
        body["odata.metadata"] = metadata;
      }

      if (accept === FULL_METADATA_ACCEPT) {
        body["odata.metadata"] = metadata;
        body["odata.type"] = type;
        body["body.id"] = id;
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
    // const tableCtx = new TableStorageContext(context);
    // const accountName = tableCtx.account;
    // const tableName = tableCtx.tableName; // Get tableName from context
    // TODO
    throw new NotImplementedError();
  }

  public async setAccessPolicy(
    table: string,
    options: Models.TableSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableSetAccessPolicyResponse> {
    // e.g
    // const tableCtx = new TableStorageContext(context);
    // const accountName = tableCtx.account;
    // const tableName = tableCtx.tableName; // Get tableName from context
    // TODO
    throw new NotImplementedError();
  }
}
