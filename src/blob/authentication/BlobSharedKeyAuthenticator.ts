import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import { computeHMACSHA256, getURLQueries } from "../../common/utils/utils";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import { HeaderConstants } from "../utils/constants";
import IAuthenticator from "./IAuthenticator";

export default class BlobSharedKeyAuthenticator implements IAuthenticator {
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
      `BlobSharedKeyAuthenticator:validate() Start validation against account shared key authentication.`,
      blobContext.contextId
    );

    const authHeaderValue = req.getHeader(HeaderConstants.AUTHORIZATION);
    if (authHeaderValue === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `BlobSharedKeyAuthenticator:validate() Request doesn't include valid authentication header. Skip shared key authentication.`,
        blobContext.contextId
      );
      return undefined;
    }

    // TODO: Make following async
    const accountProperties = this.dataStore.getAccount(account);
    if (accountProperties === undefined) {
      this.logger.error(
        `BlobSharedKeyAuthenticator:validate() Invalid storage account ${account}.`,
        blobContext.contextId
      );
      throw StorageErrorFactory.getInvalidOperation(
        blobContext.contextId!,
        "Invalid storage account."
      );
    }

    const stringToSign: string =
      [
        req.getMethod().toUpperCase(),
        this.getHeaderValueToSign(req, HeaderConstants.CONTENT_ENCODING),
        this.getHeaderValueToSign(req, HeaderConstants.CONTENT_LANGUAGE),
        this.getHeaderValueToSign(req, HeaderConstants.CONTENT_LENGTH),
        this.getHeaderValueToSign(req, HeaderConstants.CONTENT_MD5),
        this.getHeaderValueToSign(req, HeaderConstants.CONTENT_TYPE),
        this.getHeaderValueToSign(req, HeaderConstants.DATE),
        this.getHeaderValueToSign(req, HeaderConstants.IF_MODIFIED_SINCE),
        this.getHeaderValueToSign(req, HeaderConstants.IF_MATCH),
        this.getHeaderValueToSign(req, HeaderConstants.IF_NONE_MATCH),
        this.getHeaderValueToSign(req, HeaderConstants.IF_UNMODIFIED_SINCE),
        this.getHeaderValueToSign(req, HeaderConstants.RANGE)
      ].join("\n") +
      "\n" +
      this.getCanonicalizedHeadersString(req) +
      this.getCanonicalizedResourceString(
        req,
        account,
        context.context.isSecondary ? blobContext.authenticationPath + "-secondary" : blobContext.authenticationPath
      );

    this.logger.info(
      `BlobSharedKeyAuthenticator:validate() [STRING TO SIGN]:${JSON.stringify(
        stringToSign
      )}`,
      blobContext.contextId
    );

    const signature1 = computeHMACSHA256(stringToSign, accountProperties.key1);
    const authValue1 = `SharedKey ${account}:${signature1}`;
    this.logger.info(
      `BlobSharedKeyAuthenticator:validate() Calculated authentication header based on key1: ${authValue1}`,
      blobContext.contextId
    );
    if (authHeaderValue === authValue1) {
      this.logger.info(
        `BlobSharedKeyAuthenticator:validate() Signature 1 matched.`,
        blobContext.contextId
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
        `BlobSharedKeyAuthenticator:validate() Calculated authentication header based on key2: ${authValue2}`,
        blobContext.contextId
      );
      if (authHeaderValue === authValue2) {
        this.logger.info(
          `BlobSharedKeyAuthenticator:validate() Signature 2 matched.`,
          blobContext.contextId
        );
        return true;
      }
    }

    // this.logger.info(`[URL]:${req.getUrl()}`);
    // this.logger.info(`[HEADERS]:${req.getHeaders().toString()}`);
    // this.logger.info(`[KEY]: ${request.headers.get(HeaderConstants.AUTHORIZATION)}`);

    this.logger.info(
      `BlobSharedKeyAuthenticator:validate() Validation failed.`,
      blobContext.contextId
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
   * To construct the CanonicalizedHeaders portion of the signature string, follow these steps:
   * 1. Retrieve all headers for the resource that begin with x-ms-, including the x-ms-date header.
   * 2. Convert each HTTP header name to lowercase.
   * 3. Sort the headers lexicographically by header name, in ascending order.
   *    Each header may appear only once in the string.
   * 4. Replace any linear whitespace in the header value with a single space.
   * 5. Trim any whitespace around the colon in the header.
   * 6. Finally, append a new-line character to each canonicalized header in the resulting list.
   *    Construct the CanonicalizedHeaders string by concatenating all headers in this list into a single string.
   *
   * @private
   * @param {IRequest} request
   * @returns {string}
   * @memberof SharedKeyCredentialPolicy
   */
  private getCanonicalizedHeadersString(request: IRequest): string {
    const headers: { value: string; name: string }[] = [];
    const headersObject = request.getHeaders();
    for (const name in headersObject) {
      if (headersObject.hasOwnProperty(name)) {
        const value = headersObject[name];
        if (value === undefined) {
          headers.push({ name, value: "" });
        } else if (typeof value === "string") {
          headers.push({ name, value });
        } else {
          headers.push({ name, value: value.join(",") });
        }
      }
    }

    const headersArray = headers.filter((value) => {
      return value.name
        .toLowerCase()
        .startsWith(HeaderConstants.PREFIX_FOR_STORAGE);
    });

    headersArray.sort((a, b): number => {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    let canonicalizedHeadersStringToSign: string = "";
    headersArray.forEach((header) => {
      canonicalizedHeadersStringToSign += `${header.name
        .toLowerCase()
        .trimRight()}:${header.value.trimLeft()}\n`;
    });

    return canonicalizedHeadersStringToSign;
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

      queryKeys.sort();
      for (const key of queryKeys) {
        canonicalizedResourceString += `\n${key}:${decodeURIComponent(
          lowercaseQueries[key]
        )}`;
      }
    }

    return canonicalizedResourceString;
  }
}
