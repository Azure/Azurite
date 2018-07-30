import { Operations } from "../../core/Constants";
import env from "../../core/env";
import AzuriteQueueRequest from "../../model/queue/AzuriteQueueRequest";
import QueueMessageText from "../../xml/queue/QueueMessageText";

/*
 * Route definitions for all operation on the "message" resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-messages
 * for details on specification.
 */
export default app => {
  app
    .route(`/${env.emulatedStorageAccountName}/:queue/messages/:messageId*?`)
    .get((req, res, next) => {
      if (req.query.peekonly === "true") {
        req.azuriteOperation = Operations.Queue.PEEK_MESSAGES;
        req.azuriteRequest = new AzuriteQueueRequest({ req });
      } else {
        req.azuriteOperation = Operations.Queue.GET_MESSAGE;
        req.azuriteRequest = new AzuriteQueueRequest(
          req,
          undefined,
          Operations.Queue.GET_MESSAGE
        );
      }
      next();
    })
    .head((req, res, next) => {
      next();
    })
    .put((req, res, next) => {
      req.azuriteOperation = Operations.Queue.UPDATE_MESSAGE;
      QueueMessageText.toJs(req.body).then(payload => {
        req.azuriteRequest = new AzuriteQueueRequest(req, payload);
        next();
      });
    })
    .post((req, res, next) => {
      req.azuriteOperation = Operations.Queue.PUT_MESSAGE;
      QueueMessageText.toJs(req.body).then(payload => {
        req.azuriteRequest = new AzuriteQueueRequest(req, payload);
        next();
      });
    })
    .delete((req, res, next) => {
      req.azuriteOperation = req.params.messageId
        ? Operations.Queue.DELETE_MESSAGE
        : Operations.Queue.CLEAR_MESSAGES;
      req.azuriteRequest = new AzuriteQueueRequest(req);
      next();
    });
};
