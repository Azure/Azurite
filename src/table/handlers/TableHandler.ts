import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import BaseHandler from "./BaseHandler";

import TableStorageContext from "../context/TableStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import ITableHandler from "../generated/handlers/ITableHandler";
import { TableModel } from "../persistence/ITableMetadataStore";

import {
  DEFAULT_TABLE_LISTENING_PORT,
  DEFAULT_TABLE_SERVER_HOST_NAME,
  FULL_METADATA_ACCEPT,
  MINIMAL_METADATA_ACCEPT,
  NO_METADATA_ACCEPT,
  TABLE_API_VERSION
} from "../utils/constants";

export default class TableHandler extends BaseHandler implements ITableHandler {
  public async create(
    tableProperties: Models.TableProperties,
    options: Models.TableCreateOptionalParams,
    context: Context
  ): Promise<Models.TableCreateResponse> {
    const tableCtx = new TableStorageContext(context);
    const accountName = tableCtx.account;

    if (accountName === undefined) {
      throw StorageErrorFactory.getAccountNameEmpty();
    }

    const tableName = tableCtx.tableName;
    if (tableName === undefined) {
      throw StorageErrorFactory.getTableNameEmpty();
    }

    const metadata = `${accountName}/$metadata#Tables/@Element`;
    const type = `${accountName}.Tables`;
    const id = `Tables(${tableName})`;
    const editLink = `Tables(${tableName})`;

    const table: TableModel = {
      account: accountName,
      name: tableName,
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
    return response;
  }

  public async query(
    options: Models.TableQueryOptionalParams,
    context: Context
  ): Promise<Models.TableQueryResponse2> {
    // TODO
    throw new NotImplementedError();
  }

  public async delete(
    table: string,
    options: Models.TableDeleteMethodOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async queryEntities(
    table: string,
    options: Models.TableQueryEntitiesOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async queryEntitiesWithPartitionAndRowKey(
    table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableQueryEntitiesWithPartitionAndRowKeyOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesWithPartitionAndRowKeyResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async updateEntity(
    table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableUpdateEntityOptionalParams,
    context: Context
  ): Promise<Models.TableUpdateEntityResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async mergeEntity(
    table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableMergeEntityOptionalParams,
    context: Context
  ): Promise<Models.TableMergeEntityResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async deleteEntity(
    table: string,
    partitionKey: string,
    rowKey: string,
    ifMatch: string,
    options: Models.TableDeleteEntityOptionalParams,
    context: Context
  ): Promise<Models.TableDeleteEntityResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async insertEntity(
    table: string,
    options: Models.TableInsertEntityOptionalParams,
    context: Context
  ): Promise<Models.TableInsertEntityResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async getAccessPolicy(
    table: string,
    options: Models.TableGetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableGetAccessPolicyResponse> {
    // TODO
    throw new NotImplementedError();
  }

  public async setAccessPolicy(
    table: string,
    options: Models.TableSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableSetAccessPolicyResponse> {
    // TODO
    throw new NotImplementedError();
  }
}
