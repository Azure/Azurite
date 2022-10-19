import { NextFunction, Request, RequestHandler, Response } from "express";

import ILogger from "../../common/ILogger";
import IAuthenticator from "../authentication/IAuthenticator";
import BlobStorageContext from "../context/BlobStorageContext";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import ExpressRequestAdapter from "../generated/ExpressRequestAdapter";
import ExpressResponseAdapter from "../generated/ExpressResponseAdapter";
import IRequest from "../generated/IRequest";
import IResponse from "../generated/IResponse";
import { DEFAULT_CONTEXT_PATH } from "../utils/constants";

export default class AuthenticationMiddlewareFactory {
  constructor(private readonly logger: ILogger) {}

  public createAuthenticationMiddleware(
    authenticators: IAuthenticator[]
  ): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      const request = new ExpressRequestAdapter(req);
      const response = new ExpressResponseAdapter(res);
      const context = new BlobStorageContext(res.locals, DEFAULT_CONTEXT_PATH);
      this.authenticate(context,
        request, response, authenticators)
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

  public async authenticate(
    context: BlobStorageContext,
    req: IRequest,
    res: IResponse,
    authenticators: IAuthenticator[]
  ): Promise<boolean> {

    this.logger.verbose(
      `AuthenticationMiddlewareFactory:createAuthenticationMiddleware() Validating authentications.`,
      context.contextId
    );

    let pass: boolean | undefined = false;
    for (const authenticator of authenticators) {
      pass = await authenticator.validate(req, context);
      if (pass === true) {
        return true;
      }
    }
    return false;
  }
}
