import { Operations } from "../../core/Constants";
import env from "../../core/env";
import AzuriteQueueRequest from "../../model/queue/AzuriteQueueRequest";
import { parseSignedIdentifiers } from "../../xml/Serializers";

/*
 * Route definitions for all operation on the "queue" resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-queues
 * for details on specification.
 */
export default app => {
  app
    .route(`/${env.emulatedStorageAccountName}/:queue/`)
    .get((req, res, next) => {
      if (req.query.comp === "metadata") {
        req.azuriteOperation = Operations.Queue.GET_QUEUE_METADATA;
      } else if (req.query.comp === "acl") {
        req.azuriteOperation = Operations.Queue.GET_QUEUE_ACL;
      }
      req.azuriteRequest = new AzuriteQueueRequest(req);
      next();
    })
    .head((req, res, next) => {
      if (req.query.comp === "metadata") {
        req.azuriteOperation = Operations.Queue.GET_QUEUE_METADATA;
      } else if (req.query.comp === "acl") {
        req.azuriteOperation = Operations.Queue.GET_QUEUE_ACL;
      }
      req.azuriteRequest = new AzuriteQueueRequest(req);
      next();
    })
    .put((req, res, next) => {
      if (req.query.comp === "metadata") {
        req.azuriteOperation = Operations.Queue.SET_QUEUE_METADATA;
      } else if (req.query.comp === "acl") {
        req.azuriteOperation = Operations.Queue.SET_QUEUE_ACL;
        parseSignedIdentifiers(req.body).then(signedIdentifiers => {
          req.azuriteRequest = new AzuriteQueueRequest(req, signedIdentifiers);
          next();
        });
        return;
      } else {
        req.azuriteOperation = Operations.Queue.CREATE_QUEUE;
      }
      req.azuriteRequest = new AzuriteQueueRequest(req);
      next();
    })
    .delete((req, res, next) => {
      req.azuriteOperation = Operations.Queue.DELETE_QUEUE;
      req.azuriteRequest = new AzuriteQueueRequest(req);
      next();
    });
};
