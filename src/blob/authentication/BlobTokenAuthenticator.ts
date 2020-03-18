import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import { HeaderConstants } from "../utils/constants";
import IAuthenticator from "./IAuthenticator";

export default class BlobTokenAuthenticator implements IAuthenticator {
  public constructor(
    private readonly dataStore: IAccountDataStore,
    private readonly logger: ILogger
  ) {}

  public async validate(
    req: IRequest,
    context: Context
  ): Promise<boolean | undefined> {
    const blobContext = new BlobStorageContext(context);
    const account = blobContext.account!;

    this.logger.info(
      `BlobTokenAuthenticator:validate() Start validation against token authentication.`,
      blobContext.contextId
    );

    // TODO: Make following async
    const accountProperties = this.dataStore.getAccount(account);
    if (accountProperties === undefined) {
      this.logger.error(
        `BlobTokenAuthenticator:validate() Invalid storage account ${account}.`,
        blobContext.contextId
      );
      throw StorageErrorFactory.getInvalidOperation(
        blobContext.contextId!,
        "Invalid storage account."
      );
    }

    const authHeaderValue = req.getHeader(HeaderConstants.AUTHORIZATION);
    if (authHeaderValue === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `BlobTokenAuthenticator:validate() Request doesn't include valid authentication header. Skip token authentication.`,
        blobContext.contextId
      );
      return undefined;
    } else {
      const hasBearerToken = authHeaderValue.startsWith("Bearer");

      if (hasBearerToken) {
        this.logger.info(
          // tslint:disable-next-line:max-line-length
          `BlobTokenAuthenticator:validate() Request includes Bearer token.`,
          blobContext.contextId
        );
      } else {
        this.logger.info(
          // tslint:disable-next-line:max-line-length
          `BlobTokenAuthenticator:validate() Request does not include Bearer token. Skip token authentication.`,
          blobContext.contextId
        );
      }
      return hasBearerToken;
    }
  }
}
