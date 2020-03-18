import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import QueueStorageContext from "../context/QueueStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import { HeaderConstants } from "../utils/constants";
import IAuthenticator from "./IAuthenticator";

export default class QueueTokenAuthenticator implements IAuthenticator {
  public constructor(
    private readonly dataStore: IAccountDataStore,
    private readonly logger: ILogger
  ) {}

  public async validate(
    req: IRequest,
    context: Context
  ): Promise<boolean | undefined> {
    const queueContext = new QueueStorageContext(context);
    const account = queueContext.account!;

    this.logger.info(
      `QueueTokenAuthenticator:validate() Start validation against token authentication.`,
      queueContext.contextID
    );

    // TODO: Make following async
    const accountProperties = this.dataStore.getAccount(account);
    if (accountProperties === undefined) {
      this.logger.error(
        `QueueTokenAuthenticator:validate() Invalid storage account ${account}.`,
        queueContext.contextID
      );
      throw StorageErrorFactory.getInvalidOperation(
        queueContext.contextID!,
        "Invalid storage account."
      );
    }

    const authHeaderValue = req.getHeader(HeaderConstants.AUTHORIZATION);
    if (authHeaderValue === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `QueueTokenAuthenticator:validate() Request doesn't include valid authentication header. Skip token authentication.`,
        queueContext.contextID
      );
      return undefined;
    } else {
      const hasBearerToken = authHeaderValue.startsWith("Bearer");

      if (hasBearerToken) {
        this.logger.info(
          // tslint:disable-next-line:max-line-length
          `QueueTokenAuthenticator:validate() Request includes Bearer token.`,
          queueContext.contextID
        );
      } else {
        this.logger.info(
          // tslint:disable-next-line:max-line-length
          `QueueTokenAuthenticator:validate() Request does not include Bearer token. Skip token authentication.`,
          queueContext.contextID
        );
      }
      return hasBearerToken;
    }
  }
}
