import { decode } from "jsonwebtoken";
import IAccountDataStore from "../../common/IAccountDataStore";
import ILogger from "../../common/ILogger";
import { OAuthLevel } from "../../common/models";
import {
  BEARER_TOKEN_PREFIX,
  HTTPS,
  VALID_ISSUE_PREFIXES
} from "../../common/utils/constants";
import TableStorageContext from "../context/TableStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import Operation from "../generated/artifacts/operation";
import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import { HeaderConstants, VALID_TABLE_AUDIENCES } from "../utils/constants";
import IAuthenticator from "./IAuthenticator";

export default class TableTokenAuthenticator implements IAuthenticator {
  public constructor(
    private readonly dataStore: IAccountDataStore,
    private readonly oauth: OAuthLevel,
    private readonly logger: ILogger
  ) { }

  public async validate(
    req: IRequest,
    context: Context
  ): Promise<boolean | undefined> {
    const tableContext = new TableStorageContext(context);
    const account = tableContext.account!;

    this.logger.info(
      `TableTokenAuthenticator:validate() Start validation against token authentication.`,
      tableContext.contextID
    );

    // TODO: Make following async
    const accountProperties = this.dataStore.getAccount(account);
    if (accountProperties === undefined) {
      this.logger.error(
        `TableTokenAuthenticator:validate() Invalid storage account ${account}.`,
        tableContext.contextID
      );
      throw StorageErrorFactory.ResourceNotFound(
        context
      );
    }

    const authHeaderValue = req.getHeader(HeaderConstants.AUTHORIZATION);
    if (authHeaderValue === undefined) {
      this.logger.info(
        `TableTokenAuthenticator:validate() Request doesn't include valid authentication header. Skip token authentication.`,
        tableContext.contextID
      );
      return;
    }

    if (
      tableContext.operation === Operation.Table_GetAccessPolicy ||
      tableContext.operation === Operation.Table_SetAccessPolicy
    ) {
      this.logger.info(
        `TableTokenAuthenticator:validate() Operation is not available with OAuth. Skip token authentication.`,
        tableContext.contextID
      );
      return;
    }

    if (!authHeaderValue.startsWith(BEARER_TOKEN_PREFIX)) {
      throw StorageErrorFactory.getInvalidAuthenticationInfo(context);
    }

    if (req.getProtocol().toLowerCase() !== HTTPS) {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Authentication scheme Bearer is not allowed with HTTP."
      );
    }

    // TODO: Check API Version and enable bearer challenge after 2019-12-12

    const token = authHeaderValue.substr(BEARER_TOKEN_PREFIX.length + 1);

    switch (this.oauth) {
      case OAuthLevel.BASIC:
        return this.authenticateBasic(token, context);
      default:
        this.logger.warn(
          `TableTokenAuthenticator:validate() Unknown OAuth level ${this.oauth}. Skip token authentication.`,
          tableContext.contextID
        );
        return;
    }
  }

  public async authenticateBasic(
    token: string,
    context: Context
  ): Promise<boolean> {
    // tslint:disable: max-line-length
    /**
     * Example OAuth Bearer Token:
     * {
     *   "aud": "https://storage.azure.com",
     *   "iss": "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
     *   "iat": 1511859603,
     *   "nbf": 1511859603,
     *   "exp": 1511863503,
     *   "_claim_names": {
     *     "groups": "src1"
     *   },
     *   "_claim_sources": {
     *     "src1": {
     *       "endpoint": "https://graph.ppe.windows.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/users/11059fcc-5514-4800-b5f8-49808b9cfab6/getMemberObjects"
     *     }
     *   },
     *   "acr": "1",
     *   "aio": "ASQA2/8JAAAAE9BLp+qWOO0iEg3n6mjPNqaoHSCIqhQQ8OCinJcub7U=",
     *   "amr": [
     *     "pwd"
     *   ],
     *   "appid": "f997392c-e15a-4ad8-af9e-cd6966caba7f",
     *   "appidacr": "0",
     *   "e_exp": 262800,
     *   "ipaddr": "167.220.255.51",
     *   "name": "test",
     *   "oid": "11059fcc-5514-4800-b5f8-49808b9cfab6",
     *   "puid": "10033FFFA6976143",
     *   "scp": "user_impersonation",
     *   "sub": "JeH2dBcxZp-_pKoskdxOilGj234LhlM_0GBM4JvSrJw",
     *   "tid": "ab1f708d-50f6-404c-a006-d71b2ac7a606",
     *   "unique_name": "test@oauthtest102.ccsctp.net",
     *   "upn": "test@oauthtest102.ccsctp.net",
     *   "uti": "dd77i7fCB0yn8aQYUqsJAA",
     *   "ver": "1.0"
     * }
     */

    // Validate JWT token format
    let decoded;
    try {
      decoded = decode(token) as { [key: string]: any };
    } catch {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Authentication scheme Bearer is not supported."
      );
    }

    if (!decoded) {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Authentication scheme Bearer is not supported."
      );
    }

    // Validate signature, skip in basic check

    // Validate nbf & exp
    if (
      decoded.nbf === undefined ||
      decoded.exp === undefined ||
      decoded.iat === undefined
    ) {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Authentication scheme Bearer is not supported."
      );
    }

    const now = context.startTime!.getTime();
    const nbf = (decoded.nbf as number) * 1000;
    const exp = (decoded.exp as number) * 1000;

    if (now < nbf) {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Lifetime validation failed."
      );
    }

    if (now > exp) {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Lifetime validation failed. The token is expired."
      );
    }

    const iss = decoded.iss as string;
    if (!iss) {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Authentication scheme Bearer is not supported."
      );
    }

    let issMatch = false;
    for (const validIssuePrefix of VALID_ISSUE_PREFIXES) {
      if (iss.startsWith(validIssuePrefix)) {
        issMatch = true;
        break;
      }
    }

    if (!issMatch) {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Invalid token issuer."
      );
    }

    const aud = decoded.aud as string;
    if (!aud) {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Authentication scheme Bearer is not supported."
      );
    }

    const tableContext = context as TableStorageContext;
    let audMatch = false;
    let m;
    for (const regex of VALID_TABLE_AUDIENCES) {
      m = regex.exec(aud);
      if (m !== null) {
        if (m[0] === aud) {
          if (m[1] !== undefined && m[1] !== tableContext.account) {
            // If account name doesn't match for fine-grained audience
            break;
          }
          audMatch = true;
          break;
        }
      }
    }

    if (!audMatch) {
      throw StorageErrorFactory.getAuthenticationFailed(
        context,
        "Invalid token audience."
      );
    }

    // Skip validate scope
    // Currently scope maybe null or user_impersonation

    this.logger.info(
      `TableTokenAuthenticator:authenticateBasic() Validation against token authentication successfully.`,
      tableContext.contextID
    );
    return true;
  }
}
