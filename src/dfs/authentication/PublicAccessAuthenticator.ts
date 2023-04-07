import ILogger from "../../common/ILogger";
import { PublicAccessType } from "../generated/artifacts/models";
import Operation from "../generated/artifacts/operation";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import IDataLakeMetadataStore from "../persistence/IDataLakeMetadataStore";
import IAuthenticator from "./IAuthenticator";

const CONTAINER_PUBLIC_READ_OPERATIONS = new Set<Operation>([
  //blob
  Operation.Container_GetProperties,
  Operation.Container_GetPropertiesWithHead,
  Operation.Container_GetAccessPolicy,
  Operation.PageBlob_GetPageRanges, // TODO: Not sure
  Operation.PageBlob_GetPageRangesDiff, // TODO: Not sure
  Operation.BlockBlob_GetBlockList, // TODO: Not sure
  //DataLake
  Operation.FileSystem_GetProperties,
  Operation.FileSystem_ListBlobFlatSegment,
  Operation.FileSystem_ListBlobHierarchySegment,
  Operation.FileSystem_ListPaths,
  Operation.Path_Read,
  Operation.Path_GetProperties
]);

const BLOB_PUBLIC_READ_OPERATIONS = new Set<Operation>([
  //blob
  Operation.PageBlob_GetPageRanges, // TODO: Not sure
  Operation.PageBlob_GetPageRangesDiff, // TODO: Not sure
  Operation.BlockBlob_GetBlockList, // TODO: Not sure
  //DataLake
  Operation.Path_Read,
  Operation.Path_GetProperties
]);

export default class PublicAccessAuthenticator implements IAuthenticator {
  public constructor(
    private readonly blobMetadataStore: IDataLakeMetadataStore,
    private readonly logger: ILogger
  ) {}

  public async validate(
    req: IRequest,
    context: Context
  ): Promise<boolean | undefined> {
    this.logger.info(
      `PublicAccessAuthenticator:validate() Start validation against public access.`,
      context.contextId
    );

    this.logger.debug(
      "PublicAccessAuthenticator:validate() Getting account properties...",
      context.contextId
    );

    const account: string = context.context.account;
    const containerName: string | undefined = context.context.container;
    const blobName: string | undefined = context.context.blob;
    this.logger.debug(
      // tslint:disable-next-line:max-line-length
      `PublicAccessAuthenticator:validate() Retrieved account name from context: ${account}, container: ${containerName}, blob: ${blobName}`,
      context.contextId
    );

    if (containerName === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `PublicAccessAuthenticator:validate() Skip public access authentication. Container name is undefined.`,
        context.contextId
      );
      return undefined;
    }

    const containerPublicAccessType = await this.getContainerPublicAccessType(
      account,
      containerName,
      context
    );
    if (containerPublicAccessType === undefined) {
      this.logger.debug(
        // tslint:disable-next-line:max-line-length
        `PublicAccessAuthenticator:validate() Skip public access authentication. Cannot get public access type for container ${containerName}`,
        context.contextId
      );
      return undefined;
    }
    this.logger.debug(
      `PublicAccessAuthenticator:validate() Public access type for container ${containerName} is ${JSON.stringify(
        containerPublicAccessType
      )}`,
      context.contextId
    );

    const operation = context.operation;
    if (operation === undefined) {
      throw new Error(
        // tslint:disable-next-line:max-line-length
        `PublicAccessAuthenticator:validate() Operation shouldn't be undefined. Please make sure DispatchMiddleware is hooked before authentication related middleware.`
      );
    }

    if (containerPublicAccessType === PublicAccessType.Container) {
      if (CONTAINER_PUBLIC_READ_OPERATIONS.has(operation)) {
        this.logger.debug(
          `PublicAccessAuthenticator:validate() Operation ${Operation[operation]} is in container level public access list. Validation passed.`,
          context.contextId
        );
        return true;
      }
    } else if (containerPublicAccessType === PublicAccessType.Blob) {
      if (BLOB_PUBLIC_READ_OPERATIONS.has(operation)) {
        this.logger.debug(
          `PublicAccessAuthenticator:validate() Operation ${Operation[operation]} is in blob level public access list. Validation passed.`,
          context.contextId
        );
        return true;
      }
    } else {
      throw Error(
        `PublicAccessAuthenticator:validate() Unsupported containerPublicAccessType ${containerPublicAccessType}`
      );
    }

    this.logger.debug(
      `PublicAccessAuthenticator:validate() Operation ${Operation[operation]} is not in container neither blob level public access list. Validation failed.`,
      context.contextId
    );

    // TODO: Make validate() return values into 3 candidates (true, false, and error thrown)
    // True means validation passed
    // False means validation doesn't match (due to not match this validation pattern), then goto next authenticator
    // Error means validation failed, response will return error immediately
    return undefined;
  }

  private async getContainerPublicAccessType(
    account: string,
    container: string,
    context: Context
  ): Promise<PublicAccessType | undefined> {
    try {
      const containerModel = await this.blobMetadataStore.getContainerACL(
        context,
        account,
        container,
        false
      );
      if (containerModel === undefined) {
        return undefined;
      }
      return containerModel.properties.publicAccess;
    } catch (err) {
      return undefined;
    }
  }
}
