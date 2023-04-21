import DataLakeContext from "../context/DataLakeContext";
import * as Models from "../generated/artifacts/models";
import Context from "../../blob/generated/Context";
import IServiceHandler from "../generated/handlers/IServiceHandler";
import {
  DATA_LAKE_API_VERSION,
  DEFAULT_LIST_CONTAINERS_MAX_RESULTS
} from "../utils/constants";
import BlobServiceHandler from "../../blob/handlers/ServiceHandler";

/**
 * ServiceHandler handles Azure Storage Blob service related requests.
 *
 * @export
 * @class ServiceHandler
 * @implements {IHandler}
 */
export default class ServiceHandler
  extends BlobServiceHandler
  implements IServiceHandler
{
  /**
   * List filesystems aka containers.
   *
   * @param {Models.ServiceListFileSystemsOptionalParams} options
   * @param {Context} context
   * @returns {Promise<Models.ServiceListFileSystemsResponse>}
   * @memberof ServiceHandler
   */
  async listFileSystems(
    options: Models.ServiceListFileSystemsOptionalParams,
    context: Context
  ): Promise<Models.ServiceListFileSystemsResponse> {
    const blobCtx = new DataLakeContext(context);
    const accountName = blobCtx.account!;

    options.maxResults =
      options.maxResults || DEFAULT_LIST_CONTAINERS_MAX_RESULTS;
    options.prefix = options.prefix || "";

    const marker = options.continuation || "";

    const [filesystems, continuation] = await this.metadataStore.listContainers(
      context,
      accountName,
      options.prefix,
      options.maxResults,
      marker
    );

    const res: Models.ServiceListFileSystemsResponse = {
      filesystems,
      continuation,
      statusCode: 200,
      requestId: context.contextId,
      version: DATA_LAKE_API_VERSION
    };

    return res;
  }
}
