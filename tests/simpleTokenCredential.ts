import {
  TokenCredential,
  AccessToken,
  GetTokenOptions
} from "@azure/core-http";

export class SimpleTokenCredential implements TokenCredential {
  /**
   * The raw token string.  Can be changed when the token needs to be updated.
   */
  public token: string;

  /**
   * The Date at which the token expires.  Can be changed to update the expiration time.
   */
  public expiresOn: number;

  /**
   * Creates an instance of TokenCredential.
   * @param {string} token
   */
  constructor(token: string, expiresOn?: Date) {
    this.token = token;
    this.expiresOn = expiresOn
      ? expiresOn.getTime()
      : Date.now() + 60 * 60 * 1000;
  }

  /**
   * Retrieves the token stored in this RawTokenCredential.
   *
   * @param _scopes Ignored since token is already known.
   * @param _options Ignored since token is already known.
   * @returns {AccessToken} The access token details.
   */
  async getToken(
    _scopes: string | string[],
    _options?: GetTokenOptions
  ): Promise<AccessToken | null> {
    return {
      token: this.token,
      expiresOnTimestamp: this.expiresOn
    };
  }
}
