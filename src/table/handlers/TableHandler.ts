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
      throw StorageErrorFactory.contentTypeNotSupported(context);
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
    const id = `Tables(${tableName})`;
    const editLink = `Tables(${tableName})`;

    const table: TableModel = {
      account: accountName,
      tableName,
      odatametadata: metadata,
      odatatype: type,
      odataid: id,
      odataeditLink: editLink
    };

    const statusCode = await this.metadataStore.createTable(context, table);
    const response: Models.TableCreateResponse = {
      clientRequestId: options.requestId,
      requestId: tableCtx.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode
    };

    let protocol = "http";
    let host =
      DEFAULT_TABLE_SERVER_HOST_NAME + ":" + DEFAULT_TABLE_LISTENING_PORT;
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
    table: string,
    options: Models.TableDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteResponse> {
    // e.g
    // const tableCtx = new TableStorageContext(context);
    // const accountName = tableCtx.account;
    // const tableName = tableCtx.tableName; // Get tableName from context
    // return {
    //   statusCode: 204,
    //   clientRequestId: "clientRequestId",
    //   requestId: "requestId",
    //   version: "version"
    // };

    // TODO
    throw new NotImplementedError();
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
    // e.g
    // const tableCtx = new TableStorageContext(context);
    // const accountName = tableCtx.account;
    // const tableName = tableCtx.tableName; // Get tableName from context
    // const partitionKey = tableCtx.partitionKey!; // Get partitionKey from context
    // const rowKey = tableCtx.rowKey!; // Get rowKey from context
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
      // TODO: Check error code and error message
      throw new Error("Invalid entity");
    }

    const entity: IEntity = options.tableEntityProperties as IEntity;
    const eTag = newEtag();

    entity.eTag = eTag;

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

    entity.metadata = metadata;
    entity.type = type;
    entity.id = id;
    entity.editLink = editLink;

    await this.metadataStore.insertTableEntity(context, tableName, entity);

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
      throw StorageErrorFactory.contentTypeNotSupported(context);
    }

    response.contentType = "application/json";

    if (context.request!.getHeader("Prefer") === RETURN_NO_CONTENT) {
      response.statusCode = 204;
      response.preferenceApplied = RETURN_NO_CONTENT;
    }

    if (context.request!.getHeader("Prefer") === RETURN_CONTENT) {
      response.statusCode = 201;
      response.preferenceApplied = "return-content";

      if (accept === MINIMAL_METADATA_ACCEPT) {
        response["odata.metadata"] = metadata;
      }

      if (accept === FULL_METADATA_ACCEPT) {
        response["odata.metadata"] = metadata;
        response["odata.type"] = type;
        response["odata.id"] = id;
        response["odata.etag"] = eTag;
        response["odata.editLink"] = editLink;
      }

      // TODO: Filter out non entity properties in response body (how about update swagger to response stream type?)
      for (const key of Object.keys(entity)) {
        response[key] = entity[key];
      }
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
