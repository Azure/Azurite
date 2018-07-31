import * as  BbPromise from "bluebird";
import { Operations } from "../../core/Constants";
import QueueManager from "./../../core/queue/QueueManager";
import NumOfSignedIdentifiersVal from "./../../validation/NumOfSignedIdentifiers";
import MessageExistsValidation from "./../../validation/queue/MessageExists";
import MessageExpired from "./../../validation/queue/MessageExpired";
import NumOfMessagesValidation from "./../../validation/queue/NumOfMessages";
import PopReceiptValidation from "./../../validation/queue/PopReceipt";
import QueueCreationValidation from "./../../validation/queue/QueueCreation";
import QueueExistsValidation from "./../../validation/queue/QueueExists";
import QueueMessageSizeValidation from "./../../validation/queue/QueueMessageSize";
import QueueNameValidation from "./../../validation/queue/QueueName";
import ValidationContext from "./../../validation/queue/ValidationContext";
import VisibilityTimeoutValueValidation from "./../../validation/queue/VisibilityTimeoutValue";

export default (req, res, next) => {
  BbPromise.try(() => {
    const request = req.azuriteRequest || {};
    const { queue, message } = QueueManager.getQueueAndMessage(
      request.queueName,
      request.messageId
    );
    const validationContext = new ValidationContext({
      message,
      operation: req.azuriteOperation,
      queue,
      request
    });
    validations[req.azuriteOperation](validationContext);
    next();
  }).catch(e => {
    res.status(e.statusCode || 500).send(e.message);
    if (!e.statusCode) {
      throw e;
    }
  });
};

const validations = {};

// tslint:disable-next-line:no-empty
validations[Operations.Queue.LIST_QUEUES] = () => {};

validations[Operations.Queue.CREATE_QUEUE] = valContext => {
  valContext.run(QueueNameValidation).run(QueueCreationValidation);
};

validations[Operations.Queue.DELETE_QUEUE] = valContext => {
  valContext.run(QueueExistsValidation);
};

validations[Operations.Queue.SET_QUEUE_METADATA] = valContext => {
  valContext.run(QueueExistsValidation);
};

validations[Operations.Queue.GET_QUEUE_METADATA] = valContext => {
  valContext.run(QueueExistsValidation);
};

validations[Operations.Queue.PUT_MESSAGE] = valContext => {
  valContext
    .run(QueueExistsValidation)
    .run(VisibilityTimeoutValueValidation)
    .run(QueueMessageSizeValidation);
};

validations[Operations.Queue.GET_MESSAGE] = valContext => {
  valContext
    .run(QueueExistsValidation)
    .run(VisibilityTimeoutValueValidation)
    .run(NumOfMessagesValidation);
};

validations[Operations.Queue.CLEAR_MESSAGES] = valContext => {
  valContext.run(QueueExistsValidation);
};

validations[Operations.Queue.PEEK_MESSAGES] = valContext => {
  valContext.run(QueueExistsValidation).run(NumOfMessagesValidation);
};

validations[Operations.Queue.DELETE_MESSAGE] = valContext => {
  valContext
    .run(QueueExistsValidation)
    .run(MessageExistsValidation)
    .run(MessageExpired)
    .run(PopReceiptValidation);
};

validations[Operations.Queue.UPDATE_MESSAGE] = valContext => {
  valContext
    .run(QueueExistsValidation)
    .run(QueueMessageSizeValidation)
    .run(MessageExistsValidation)
    .run(MessageExpired)
    .run(VisibilityTimeoutValueValidation)
    .run(PopReceiptValidation);
};

validations[Operations.Queue.SET_QUEUE_ACL] = valContext => {
  valContext.run(QueueExistsValidation).run(NumOfSignedIdentifiersVal);
};

validations[Operations.Queue.GET_QUEUE_ACL] = valContext => {
  valContext.run(QueueExistsValidation);
};
