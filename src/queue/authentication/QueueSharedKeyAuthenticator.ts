import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import { computeHMACSHA256, getURLQueries } from "../../common/utils/utils";
import QueueStorageContext from "../context/QueueStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import { HeaderConstants } from "../utils/constants";
import IAuthenticator from "./IAuthenticator";

export default class QueueSharedKeyAuthenticator implements IAuthenticator {
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
      `QueueSharedKeyAuthenticator:validate() Start validation against account shared key authentication.`,
      queueContext.contextID
    );

    const authHeaderValue = req.getHeader(HeaderConstants.AUTHORIZATION);
    if (authHeaderValue === undefined) {
      this.logger.info(
        // tslint:disable-next-line:max-line-length
        `QueueSharedKeyAuthenticator:validate() Request doesn't include valid authentication header. Skip shared key authentication.`,
        queueContext.contextID
      );
      return undefined;
    }

    // TODO: Make following async
    const accountProperties = this.dataStore.getAccount(account);
    if (accountProperties === undefined) {
      this.logger.error(
        `QueueSharedKeyAuthenticator:validate() Invalid storage account ${account}.`,
        queueContext.contextID
      );
      throw StorageErrorFactory.ResourceNotFound(
        context.contextID!
      );
    }

    const authType = authHeaderValue.split(" ")[0] as
      | "SharedKey"
      | "SharedKeyLite";
    const authValue = authHeaderValue.split(" ")[1];
    const headersToSign = this.getHeadersToSign(authType, req);

    const stringToSign: string =
      headersToSign +
      this.getCanonicalizedResourceString(
        authType,
        req,
        account,
        queueContext.authenticationPath
      );

    this.logger.info(
      `QueueSharedKeyAuthenticator:validate() [STRING TO SIGN]:${JSON.stringify(
        stringToSign
      )}`,
      queueContext.contextID
    );

    const signature1 = computeHMACSHA256(stringToSign, accountProperties.key1);
    const authValue1 = `${account}:${signature1}`;
    this.logger.info(
      `QueueSharedKeyAuthenticator:validate() Calculated authentication header based on key1: ${authValue1}`,
      queueContext.contextID
    );
    if (authValue === authValue1) {
      this.logger.info(
        `QueueSharedKeyAuthenticator:validate() Signature 1 matched.`,
        queueContext.contextID
      );
      return true;
    }

    if (accountProperties.key2) {
      const signature2 = computeHMACSHA256(
        stringToSign,
        accountProperties.key2
      );
      const authValue2 = `${account}:${signature2}`;
      this.logger.info(
        `QueueSharedKeyAuthenticator:validate() Calculated authentication header based on key2: ${authValue2}`,
        queueContext.contextID
      );
      if (authValue === authValue2) {
        this.logger.info(
          `QueueSharedKeyAuthenticator:validate() Signature 2 matched.`,
          queueContext.contextID
        );
        return true;
      }
    }

    if (context.context.isSecondary && queueContext.authenticationPath?.indexOf(account) === 1)
    {
      // JS/.net Track2 SDK will generate stringToSign from IP style URI with "-secondary" in authenticationPath, so will also compare signature with this kind stringToSign
      const stringToSign_secondary: string =
      headersToSign +
      this.getCanonicalizedResourceString(
        authType,
        req,
        account,
        // The authenticationPath looks like "/devstoreaccount1/queue", add "-secondary" after account name to "/devstoreaccount1-secondary/queue"
        queueContext.authenticationPath?.replace(account, account + "-secondary")
      );

      this.logger.info(
        `QueueSharedKeyAuthenticator:validate() [STRING TO SIGN_secondary]:${JSON.stringify(
          stringToSign_secondary
        )}`,
        queueContext.contextID
      );

      const signature1_secondary = computeHMACSHA256(stringToSign_secondary, accountProperties.key1);
      const authValue1_secondary = `${account}:${signature1_secondary}`;
      this.logger.info(
        `QueueSharedKeyAuthenticator:validate() Calculated authentication header based on key1: ${authValue1_secondary}`,
        queueContext.contextID
      );
      if (authValue === authValue1_secondary) {
        this.logger.info(
          `QueueSharedKeyAuthenticator:validate() Signature 1_secondary matched.`,
          queueContext.contextID
        );
        return true;
      }

      if (accountProperties.key2) {
        const signature2_secondary = computeHMACSHA256(
          stringToSign_secondary,
          accountProperties.key2
        );
        const authValue2_secondary = `${account}:${signature2_secondary}`;
        this.logger.info(
          `QueueSharedKeyAuthenticator:validate() Calculated authentication header based on key2: ${authValue2_secondary}`,
          queueContext.contextID
        );
        if (authValue === authValue2_secondary) {
          this.logger.info(
            `QueueSharedKeyAuthenticator:validate() Signature 2_secondary matched.`,
            queueContext.contextID
          );
          return true;
        }
      }
    }

    // this.logger.info(`[URL]:${req.getUrl()}`);
    // this.logger.info(`[HEADERS]:${req.getHeaders().toString()}`);
    // this.logger.info(`[KEY]: ${request.headers.get(HeaderConstants.AUTHORIZATION)}`);

    this.logger.info(
      `QueueSharedKeyAuthenticator:validate() Validation failed.`,
      queueContext.contextID
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

    const headersArray = headers.filter(value => {
      return value.name
        .toLowerCase()
        .startsWith(HeaderConstants.PREFIX_FOR_STORAGE);
    });

    headersArray.sort((a, b): number => {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    let canonicalizedHeadersStringToSign: string = "";
    headersArray.forEach(header => {
      canonicalizedHeadersStringToSign += `${header.name
        .toLowerCase()
        .trimRight()}:${header.value.trimLeft()}\n`;
    });

    return canonicalizedHeadersStringToSign;
  }

  // TODO: doc
  /**
   * Retrieves canonicalized resource string.
   *
   * @private
   * @param {IRequest} request
   * @returns {string}
   * @memberof SharedKeyCredentialPolicy
   */
  private getCanonicalizedResourceString(
    type: "SharedKey" | "SharedKeyLite",
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
      if (type === "SharedKey") {
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
            lowercaseQueries[key].replace(/\+/g, '%20')
          )}`;
        }
      } else if (type === "SharedKeyLite") {
        for (const key in queries) {
          if (queries.hasOwnProperty(key) && key.toLowerCase() === "comp") {
            canonicalizedResourceString += `?comp=${decodeURIComponent(
              queries[key].replace(/\+/g, '%20')
            )}`;
          }
        }
      }
    }

    return canonicalizedResourceString;
  }

  // TODO: DOC
  /**
   * Get the StringToSign of headers for SharedKey or SharedKeyLite
   *
   * @private
   * @param {"SharedKey" | "SharedKeyLite"} type
   * @param {IRequest} req
   * @returns {string}
   * @memberof QueueSharedKeyAuthenticator
   */
  private getHeadersToSign(
    type: "SharedKey" | "SharedKeyLite",
    req: IRequest
  ): string {
    if (type === "SharedKey") {
      return (
        [
          req.getMethod().toUpperCase(),
          this.getHeaderValueToSign(req, HeaderConstants.CONTENT_LANGUAGE),
          this.getHeaderValueToSign(req, HeaderConstants.CONTENT_ENCODING),
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
        this.getCanonicalizedHeadersString(req)
      );
    } else if (type === "SharedKeyLite") {
      return (
        [
          req.getMethod().toUpperCase(),
          this.getHeaderValueToSign(req, HeaderConstants.CONTENT_MD5),
          this.getHeaderValueToSign(req, HeaderConstants.CONTENT_TYPE),
          this.getHeaderValueToSign(req, HeaderConstants.DATE)
        ].join("\n") +
        "\n" +
        this.getCanonicalizedHeadersString(req)
      );
    }

    return "";
  }
}
