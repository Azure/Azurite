import { Operations } from "../../core/Constants";
import Environment from "../../core/env";
import AzuriteTableRequest from "../../model/table/AzuriteTableRequest";
import N from "./../../core/HttpHeaderNames";

/*
 * Route definitions for all operation on the "message" resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-entities
 * for details on specification.
 */
export default app => {
  app
    .route(
      new RegExp(`\/${Environment.emulatedStorageAccountName}\/([A-Za-z0-9]+)(.*)`)
    )
    .get((req, res, next) => {
      if (req.azuriteOperation === undefined) {
        req.azuriteOperation = Operations.Table.QUERY_ENTITY;
        req.azuriteRequest = new AzuriteTableRequest(req);
      }
      next();
    })
    .head((req, res, next) => {
      next();
    })
    .put((req, res, next) => {
      if (req.azuriteOperation === undefined) {
        req.azuriteRequest = new AzuriteTableRequest(req, req.payload);
        req.azuriteOperation = req.azuriteRequest.httpProps[N.IF_MATCH]
          ? Operations.Table.UPDATE_ENTITY
          : Operations.Table.INSERT_OR_REPLACE_ENTITY;
      }
      next();
    })
    .post((req, res, next) => {
      if (req.azuriteOperation === undefined) {
        req.azuriteOperation = Operations.Table.INSERT_ENTITY;
        req.azuriteRequest = new AzuriteTableRequest(req, req.payload);
      }
      next();
    })
    .delete((req, res, next) => {
      req.azuriteOperation = Operations.Table.DELETE_ENTITY;
      req.azuriteRequest = new AzuriteTableRequest(req);
      next();
    })
    .merge((req, res, next) => {
      req.azuriteRequest = new AzuriteTableRequest(req, req.payload);
      req.azuriteOperation = req.azuriteRequest.httpProps[N.IF_MATCH]
        ? Operations.Table.MERGE_ENTITY
        : Operations.Table.INSERT_OR_MERGE_ENTITY;
      next();
    });
};
