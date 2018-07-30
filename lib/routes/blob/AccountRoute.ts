import { Operations } from "../../core/Constants";
import env from "../../core/env";
import AzuriteRequest from "../../model/blob/AzuriteRequest";
import ContainerRequest from "./../../model/blob/AzuriteContainerRequest";
import { parseServiceProperties } from "./../../xml/Serializers";

/*
 * Route definitions for all operation on the "Account" resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
export default app => {
  app
    .route(`/${env.emulatedStorageAccountName}`)
    .get((req, res, next) => {
      if (req.query.comp === "list") {
        req.azuriteOperation = Operations.Account.LIST_CONTAINERS;
        req.azuriteRequest = new ContainerRequest({ req });
      }
      if (req.query.comp === "properties" && req.query.restype === "service") {
        req.azuriteOperation = Operations.Account.GET_BLOB_SERVICE_PROPERTIES;
        req.azuriteRequest = new AzuriteRequest({ req });
      }
      next();
    })
    .put((req, res, next) => {
      if (req.query.comp === "properties" && req.query.restype === "service") {
        req.azuriteOperation = Operations.Account.SET_BLOB_SERVICE_PROPERTIES;
        parseServiceProperties(req.body).then(payload => {
          req.azuriteRequest = new AzuriteRequest({
            payload,
            req
          });
          next();
        });
        return;
      }
      next();
    })
    .options((req, res, next) => {
      req.azuriteOperation = Operations.Account.PREFLIGHT_BLOB_REQUEST;
      req.azuriteRequest = new AzuriteRequest({ req });
      next();
    });
};
