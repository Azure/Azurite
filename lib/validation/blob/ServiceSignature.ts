import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";
/**
 * Checks whether the operation is authorized by the service signature (if existing).
 *
 * @class ServiceSignature
 */
class ServiceSignature {
  public validate(request, containerProxy, blobProxy, moduleOptions) {
    if (request.auth === undefined) {
      // NOOP: No Service Signature signature was defined in the request
      return;
    }

    if (!request.auth.sasValid) {
      throw new AzuriteError(ErrorCodes.AuthenticationFailed);
    }

    const operation = moduleOptions.sasOperation;
    const accessPolicy = request.auth.accessPolicy;
    const resource = request.auth.resource;

    let start;
    let expiry;
    let permissions;

    if (request.auth.accessPolicy.id !== undefined) {
      const si =
        containerProxy.original.signedIdentifiers !== undefined
          ? containerProxy.original.signedIdentifiers.SignedIdentifier.filter(
              i => {
                return i.Id === request.auth.accessPolicy.id;
              }
            )[0]
          : undefined;
      if (si === undefined) {
        throw new AzuriteError(ErrorCodes.AuthenticationFailed);
      }
      start = Date.parse(si.AccessPolicy.Start);
      expiry = Date.parse(si.AccessPolicy.Expiry);
      permissions = si.AccessPolicy.Permission;
    } else {
      start = Date.parse(accessPolicy.start); // Possibly NaN
      expiry = Date.parse(accessPolicy.expiry); // Possibly NaN
      permissions = accessPolicy.permissions;
    }

    // Time Validation
    if (isNaN(expiry) || request.now < start || request.now > expiry) {
      throw new AzuriteError(ErrorCodes.AuthenticationFailed);
    }

    // Permission Validation
    if (!permissions.includes(operation)) {
      throw new AzuriteError(ErrorCodes.AuthorizationPermissionMismatch);
    }
  }
}

export default new ServiceSignature();
