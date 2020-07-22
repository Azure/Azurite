import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import BaseHandler from "./BaseHandler";

import TableStorageContext from "../context/TableStorageContext";
import NotImplementedError from "../errors/NotImplementedError";
import ITableHandler from "../generated/handlers/ITableHandler";
import { TableModel } from "../persistence/ITableMetadataStore";

import {
  DEFAULT_TABLE_LISTENING_PORT,
  DEFAULT_TABLE_SERVER_HOST_NAME,
  FULL_METADATA_ACCEPT,
  MINIMAL_METADATA_ACCEPT,
  NO_METADATA_ACCEPT,
  TABLE_API_VERSION,
} from "../utils/constants";

export default class TableHandler extends BaseHandler implements ITableHandler {
  public async create(
    tableProperties: Models.TableProperties,
    options: Models.TableCreateOptionalParams,
    context: Context
  ): Promise<Models.TableCreateResponse> {
    const tableCtx = new TableStorageContext(context);
    const accountName = tableCtx.account === undefined ? "" : tableCtx.account;
    const tableName =
      tableCtx.tableName === undefined ? "" : tableCtx.tableName;

    const table: TableModel = {
      account: accountName,
      name: tableName
    };

    const statusCode = await this.metadataStore.createTable(table, context);
    const response: Models.TableCreateResponse = {
      clientRequestId: options.requestId,
      requestId: tableCtx.contextID,
      version: TABLE_API_VERSION,
      date: context.startTime,
      statusCode
    };

    let host = DEFAULT_TABLE_SERVER_HOST_NAME + ":" + DEFAULT_TABLE_LISTENING_PORT;
    if (tableCtx.request !== undefined) {
        host = tableCtx.request.getHeader("host") as string;
    }

    if (tableCtx.accept === NO_METADATA_ACCEPT) {
      response.tableName = tableName;
    }

    if (tableCtx.accept === MINIMAL_METADATA_ACCEPT) {
      response.tableName = tableName;
      response.odatametadata =
        `http://${host}/${accountName}/$metadata#Tables/@Element`;
    }

    if (tableCtx.accept === FULL_METADATA_ACCEPT) {
      response.tableName = tableName;
      response.odatametadata =
        `http://${host}/${accountName}/$metadata#Tables/@Element`;
      response.odatatype = "${accountName}.Tables";
      response.odataid = `http://${host}/Tables(${tableName})`;
      response.odataeditLink = `Tables(${tableName})`;
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
    return undefined as any;
  }

  public async queryEntities(
    table: string,
    options: Models.TableQueryEntitiesOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesResponse> {
    // TODO
    return undefined as any;
  }

  public async queryEntitiesWithPartitionAndRowKey(
    table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableQueryEntitiesWithPartitionAndRowKeyOptionalParams,
    context: Context
  ): Promise<Models.TableQueryEntitiesWithPartitionAndRowKeyResponse> {
    // TODO
    return undefined as any;
  }

  public async updateEntity(
    table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableUpdateEntityOptionalParams,
    context: Context
  ): Promise<Models.TableUpdateEntityResponse> {
    // TODO
    return undefined as any;
  }

  public async mergeEntity(
    table: string,
    partitionKey: string,
    rowKey: string,
    options: Models.TableMergeEntityOptionalParams,
    context: Context
  ): Promise<Models.TableMergeEntityResponse> {
    // TODO
    return undefined as any;
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
    return undefined as any;
  }

  public async insertEntity(
    table: string,
    options: Models.TableInsertEntityOptionalParams,
    context: Context
  ): Promise<Models.TableInsertEntityResponse> {
    // TODO
    return undefined as any;
  }

  public async getAccessPolicy(
    table: string,
    options: Models.TableGetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableGetAccessPolicyResponse> {
    // TODO
    return undefined as any;
  }

  public async setAccessPolicy(
    table: string,
    options: Models.TableSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableSetAccessPolicyResponse> {
    // TODO
    return undefined as any;
  }
}
