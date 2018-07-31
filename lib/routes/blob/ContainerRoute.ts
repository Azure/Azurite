import { Operations } from "../../core/Constants";
import Environment from "../../core/env";
import AzuriteContainerRequest from "../../model/blob/AzuriteContainerRequest";
import { parseSignedIdentifiers } from "../../xml/Serializers";

// Possibly implicit call to blob in $root container
const REWRITE_URL_AND_FORWARD_TO_BLOB_ROUTE = (req, next) => {
  req.url = req.url.replace(
    req.params.container,
    `$root/${req.params.container}`
  );
  next("route");
};

/*
 * Route definitions for all operation on the "Container" resource type.
 * See https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/blob-service-rest-api
 * for details on specification.
 */
export default app => {
  app
    .route(`/${Environment.emulatedStorageAccountName}/:container`)
    .get((req, res, next) => {
      if (req.query.restype === "container" && req.query.comp === "list") {
        req.azuriteOperation = Operations.Container.LIST_BLOBS;
      } else if (
        req.query.restype === "container" &&
        req.query.comp === "metadata"
      ) {
        req.azuriteOperation = Operations.Container.GET_CONTAINER_METADATA;
      } else if (
        req.query.restype === "container" &&
        req.query.comp === "acl"
      ) {
        req.azuriteOperation = Operations.Container.GET_CONTAINER_ACL;
      } else if (req.query.restype === "container") {
        req.azuriteOperation = Operations.Container.GET_CONTAINER_PROPERTIES;
      } else {
        REWRITE_URL_AND_FORWARD_TO_BLOB_ROUTE(req, next);
        return;
      }
      req.azuriteRequest = new AzuriteContainerRequest(req);
      next();
    })
    .head((req, res, next) => {
      if (req.query.restype === "container" && req.query.comp === "metadata") {
        req.azuriteOperation = Operations.Container.GET_CONTAINER_METADATA;
      } else if (
        req.query.restype === "container" &&
        req.query.comp === "acl"
      ) {
        req.azuriteOperation = Operations.Container.GET_CONTAINER_ACL;
      } else if (req.query.restype === "container") {
        req.azuriteOperation = Operations.Container.GET_CONTAINER_PROPERTIES;
      } else {
        REWRITE_URL_AND_FORWARD_TO_BLOB_ROUTE(req, next);
        return;
      }
      req.azuriteRequest = new AzuriteContainerRequest(req);
      next();
    })
    .put((req, res, next) => {
      if (req.query.restype === "container" && req.query.comp === "metadata") {
        req.azuriteOperation = Operations.Container.SET_CONTAINER_METADATA;
      } else if (
        req.query.restype === "container" &&
        req.query.comp === "acl"
      ) {
        req.azuriteOperation = Operations.Container.SET_CONTAINER_ACL;
        parseSignedIdentifiers(req.body).then(signedIdentifiers => {
          req.azuriteRequest = new AzuriteContainerRequest(
            req,
            signedIdentifiers
          );
          next();
        });
        return;
      } else if (
        req.query.restype === "container" &&
        req.query.comp === "lease"
      ) {
        req.azuriteOperation = Operations.Container.LEASE_CONTAINER;
      } else if (req.query.restype === "container") {
        req.azuriteOperation = Operations.Container.CREATE_CONTAINER;
      } else {
        REWRITE_URL_AND_FORWARD_TO_BLOB_ROUTE(req, next);
        return;
      }
      req.azuriteRequest = new AzuriteContainerRequest(req);
      next();
    })
    .delete((req, res, next) => {
      if (req.query.restype === "container") {
        req.azuriteOperation = Operations.Container.DELETE_CONTAINER;
      } else {
        REWRITE_URL_AND_FORWARD_TO_BLOB_ROUTE(req, next);
        return;
      }
      req.azuriteRequest = new AzuriteContainerRequest(req);
      next();
    });
};
