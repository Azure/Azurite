import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import { computeHMACSHA256, getURLQueries } from "../../common/utils/utils";
import TableStorageContext from "../context/TableStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import { HeaderConstants } from "../utils/constants";
import IAuthenticator from "./IAuthenticator";

export default class TableSharedKeyAuthenticator implements IAuthenticator {
  public constructor(
    private readonly dataStore: IAccountDataStore,
    private readonly logger: ILogger
  ) {}

  public async validate(
    req: IRequest,
    context: Context
  ): Promise<boolean | undefined> {
    const tableContext = new TableStorageContext(context);
    const account = tableContext.account!;

    this.logger.info(
      `TableSharedKeyAuthenticator:validate() Start validation against account shared key authentication.`,
      tableContext.contextID
    );

    const authHeaderValue = req.getHeader(HeaderConstants.AUTHORIZATION);
    if (authHeaderValue === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `TableSharedKeyAuthenticator:validate() Request doesn't include valid authentication header. Skip shared key authentication.`,
        tableContext.contextID
      );
      return undefined;
    }

    // TODO: Make following async
    const accountProperties = this.dataStore.getAccount(account);
    if (accountProperties === undefined) {
      this.logger.error(
        `TableSharedKeyAuthenticator:validate() Invalid storage account ${account}.`,
        tableContext.contextID
      );
      throw StorageErrorFactory.ResourceNotFound(
        context
      );
    }

    const stringToSign: string =
      [
        req.getMethod().toUpperCase(),
        this.getHeaderValueToSign(req, HeaderConstants.CONTENT_MD5),
        this.getHeaderValueToSign(req, HeaderConstants.CONTENT_TYPE),
        this.getHeaderValueToSign(req, HeaderConstants.DATE) ||
          this.getHeaderValueToSign(req, HeaderConstants.X_MS_DATE)
      ].join("\n") +
      "\n" +
      this.getCanonicalizedResourceString(
        req,
        account,
        tableContext.authenticationPath
      );

    this.logger.info(
      `TableSharedKeyAuthenticator:validate() [STRING TO SIGN]:${JSON.stringify(
        stringToSign
      )}`,
      tableContext.contextID
    );

    const signature1 = computeHMACSHA256(stringToSign, accountProperties.key1);
    const authValue1 = `SharedKey ${account}:${signature1}`;
    this.logger.info(
      `TableSharedKeyAuthenticator:validate() Calculated authentication header based on key1: ${authValue1}`,
      tableContext.contextID
    );
    if (authHeaderValue === authValue1) {
      this.logger.info(
        `TableSharedKeyAuthenticator:validate() Signature 1 matched.`,
        tableContext.contextID
      );
      return true;
    }

    if (accountProperties.key2) {
      const signature2 = computeHMACSHA256(
        stringToSign,
        accountProperties.key2
      );
      const authValue2 = `SharedKey ${account}:${signature2}`;
      this.logger.info(
        `TableSharedKeyAuthenticator:validate() Calculated authentication header based on key2: ${authValue2}`,
        tableContext.contextID
      );
      if (authHeaderValue === authValue2) {
        this.logger.info(
          `TableSharedKeyAuthenticator:validate() Signature 2 matched.`,
          tableContext.contextID
        );
        return true;
      }
    }

    if (context.context.isSecondary && tableContext.authenticationPath?.indexOf(account) === 1)
    {
      // JS/.net Track2 SDK will generate stringToSign from IP style URI with "-secondary" in authenticationPath, so will also compare signature with this kind stringToSign
      const stringToSign_secondary: string =
      [
        req.getMethod().toUpperCase(),
        this.getHeaderValueToSign(req, HeaderConstants.CONTENT_MD5),
        this.getHeaderValueToSign(req, HeaderConstants.CONTENT_TYPE),
        this.getHeaderValueToSign(req, HeaderConstants.DATE) ||
          this.getHeaderValueToSign(req, HeaderConstants.X_MS_DATE)
      ].join("\n") +
      "\n" +
      this.getCanonicalizedResourceString(
        req,
        account,
        // The authenticationPath looks like "/devstoreaccount1/table", add "-secondary" after account name to "/devstoreaccount1-secondary/table"
        tableContext.authenticationPath?.replace(account, account + "-secondary")
      );

      this.logger.info(
        `TableSharedKeyAuthenticator:validate() [STRING TO SIGN_secondary]:${JSON.stringify(
          stringToSign_secondary
        )}`,
        tableContext.contextID
      );

      const signature1_secondary = computeHMACSHA256(stringToSign_secondary, accountProperties.key1);
      const authValue1_secondary = `SharedKey ${account}:${signature1_secondary}`;
      this.logger.info(
        `TableSharedKeyAuthenticator:validate() Calculated authentication header based on key1: ${authValue1_secondary}`,
        tableContext.contextID
      );
      if (authHeaderValue === authValue1_secondary) {
        this.logger.info(
          `TableSharedKeyAuthenticator:validate() Signature 1_secondary matched.`,
          tableContext.contextID
        );
        return true;
      }

      if (accountProperties.key2) {
        const signature2_secondary = computeHMACSHA256(
          stringToSign_secondary,
          accountProperties.key2
        );
        const authValue2_secondary = `SharedKey ${account}:${signature2_secondary}`;
        this.logger.info(
          `TableSharedKeyAuthenticator:validate() Calculated authentication header based on key2: ${authValue2_secondary}`,
          tableContext.contextID
        );
        if (authHeaderValue === authValue2_secondary) {
          this.logger.info(
            `TableSharedKeyAuthenticator:validate() Signature 2_secondary matched.`,
            tableContext.contextID
          );
          return true;
        }
      }
    }

    // this.logger.info(`[URL]:${req.getUrl()}`);
    // this.logger.info(`[HEADERS]:${req.getHeaders().toString()}`);
    // this.logger.info(`[KEY]: ${request.headers.get(HeaderConstants.AUTHORIZATION)}`);

    this.logger.info(
      `TableSharedKeyAuthenticator:validate() Validation failed.`,
      tableContext.contextID
    );
    return false;
  }

  /**
   * Retrieve header value according to shared key sign rules.
   * @see https://docs.microsoft.com/en-us/rest/api/storageservices/authenticate-with-shared-key
   *
   * @private
   * @param {WebResource} request
   * @param {string} headerName
   * @returns {string}
   * @memberof SharedKeyCredentialPolicy
   */
  private getHeaderValueToSign(request: IRequest, headerName: string): string {
    const value = request.getHeader(headerName);

    if (!value) {
      return "";
    }

    // When using version 2015-02-21 or later, if Content-Length is zero, then
    // set the Content-Length part of the StringToSign to an empty string.
    // https://docs.microsoft.com/en-us/rest/api/storageservices/authenticate-with-shared-key
    if (headerName === HeaderConstants.CONTENT_LENGTH && value === "0") {
      return "";
    }

    return value;
  }

  /**
   * Retrieves canonicalized resource string.
   *
   * @private
   * @param {IRequest} request
   * @returns {string}
   * @memberof SharedKeyCredentialPolicy
   */
  private getCanonicalizedResourceString(
    request: IRequest,
    account: string,
    authenticationPath?: string
  ): string {
    let path = request.getPath() || "/";

    // For secondary account, we use account name (without "-secondary") for the path
    if (authenticationPath !== undefined) {
      path = authenticationPath;
    }

    let canonicalizedResourceString: string = "";
    canonicalizedResourceString += `/${account}${path}`;

    const queries = getURLQueries(request.getUrl());
    const lowercaseQueries: { [key: string]: string } = {};
    if (queries) {
      const queryKeys: string[] = [];
      for (const key in queries) {
        if (queries.hasOwnProperty(key)) {
          const lowercaseKey = key.toLowerCase();
          lowercaseQueries[lowercaseKey] = queries[key];
          queryKeys.push(lowercaseKey);
        }
      }

      if (queryKeys.includes("comp")) {
        canonicalizedResourceString += "?comp=" + lowercaseQueries.comp;
      }

      // queryKeys.sort();
      // for (const key of queryKeys) {
      //   canonicalizedResourceString += `\n${key}:${decodeURIComponent(
      //     lowercaseQueries[key]
      //   )}`;
      // }
    }

    return canonicalizedResourceString;
  }
}
