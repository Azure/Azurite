import { NextFunction, Request, RequestHandler, Response } from "express";

import ILogger from "../../common/ILogger";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import ExpressRequestAdapter from "../generated/ExpressRequestAdapter";
import { DEFAULT_CONTEXT_PATH } from "../utils/constants";
import IAuthenticator from "./IAuthenticator";

export default class AuthenticationMiddlewareFactory {
  constructor(private readonly logger: ILogger) {}

  public createAuthenticationMiddleware(
    authenticators: IAuthenticator[]
  ): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      const context = new BlobStorageContext(res.locals, DEFAULT_CONTEXT_PATH);
      this.authenticate(req, res, authenticators)
        .then(pass => {
          // TODO: To support public access, we need to modify here to reject request later in handler
          if (pass) {
            next();
          } else {
            next(
              StorageErrorFactory.getAuthorizationFailure(context.contextId!)
            );
          }
        })
        .catch(next);
    };
  }

  private async authenticate(
    req: Request,
    res: Response,
    authenticators: IAuthenticator[]
  ): Promise<boolean> {
    const request = new ExpressRequestAdapter(req);
    const context = new BlobStorageContext(res.locals, DEFAULT_CONTEXT_PATH);

    this.logger.verbose(
      `AuthenticationMiddlewareFactory:createAuthenticationMiddleware() Validating authentications.`,
      context.contextId
    );

    let pass: boolean | undefined = false;
    for (const authenticator of authenticators) {
      pass = await authenticator.validate(request, context);
      if (pass === true) {
        return true;
      }
    }
    return false;
  }
}
