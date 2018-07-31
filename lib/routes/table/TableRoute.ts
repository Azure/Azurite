import { Operations } from "../../core/Constants";
import Environment from "../../core/env";
import AzuriteTableRequest from "../../model/table/AzuriteTableRequest";

/*
 * Route definitions for all operation on the "message" resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-tables
 * for details on specification.
 */
export default app => {
  app
    .route(new RegExp(`\/${Environment.emulatedStorageAccountName}\/Tables(.*)`))
    .get((req, res, next) => {
      req.azuriteOperation = Operations.Table.QUERY_TABLE;
      req.azuriteRequest = new AzuriteTableRequest(req);
      next();
    })
    .head((req, res, next) => {
      next();
    })
    .put((req, res, next) => {
      next();
    })
    .post((req, res, next) => {
      req.azuriteOperation = Operations.Table.CREATE_TABLE;
      req.azuriteRequest = new AzuriteTableRequest(req, req.payload);
      next();
    })
    .delete((req, res, next) => {
      req.azuriteOperation = Operations.Table.DELETE_TABLE;
      req.azuriteRequest = new AzuriteTableRequest(req);
      next();
    });
};
