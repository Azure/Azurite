import { NextFunction, Request, RequestHandler, Response } from "express";

import ILogger from "../../common/ILogger";
import IAuthenticator from "../authentication/IAuthenticator";
import TableStorageContext from "../context/TableStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import ExpressRequestAdapter from "../generated/ExpressRequestAdapter";
import { DEFAULT_TABLE_CONTEXT_PATH } from "../utils/constants";

export default class AuthenticationMiddlewareFactory {
  constructor(private readonly logger: ILogger) {}

  public createAuthenticationMiddleware(
    authenticators: IAuthenticator[]
  ): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      const context = new TableStorageContext(
        res.locals,
        DEFAULT_TABLE_CONTEXT_PATH
      );
      this.authenticate(req, res, authenticators)
        .then((pass) => {
          if (pass) {
            next();
          } else {
            next(StorageErrorFactory.getAuthorizationFailure(context));
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
    const context = new TableStorageContext(
      res.locals,
      DEFAULT_TABLE_CONTEXT_PATH
    );

    this.logger.verbose(
      `AuthenticationMiddlewareFactory:createAuthenticationMiddleware() Validating authentications.`,
      context.contextID
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
