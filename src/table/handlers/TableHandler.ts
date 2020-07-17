// Generated
import ITableHandler from "../generated/handlers/ITableHandler";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";

import BaseHandler from "./BaseHandler";

export default class TableHandler extends BaseHandler implements ITableHandler {
  public async query(
    options: Models.TableQueryOptionalParams,
    context: Context
  ): Promise<Models.TableQueryResponse2> {
    // TODO
    return undefined as any;
  }

  public async create(
    tableProperties: Models.TableProperties,
    options: Models.TableCreateOptionalParams,
    context: Context
  ): Promise<Models.TableCreateResponse> {
    // TODO
    return undefined as any;
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
