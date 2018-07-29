const BbPromise = from "bluebird"),
  Operations = from "./../../core/Constants").Operations,
  AzuriteQueueRequest = from "./../../model/queue/AzuriteQueueRequest"),
  QueueManager = from "./../../core/queue/QueueManager"),
  // Validation modules
  ValidationContext = from "./../../validation/queue/ValidationContext"),
  QueueCreationValidation = from "./../../validation/queue/QueueCreation"),
  QueueExistsValidation = from "./../../validation/queue/QueueExists"),
  QueueMessageSizeValidation = from "./../../validation/queue/QueueMessageSize"),
  NumOfMessagesValidation = from "./../../validation/queue/NumOfMessages"),
  QueueNameValidation = from "./../../validation/queue/QueueName"),
  MessageExistsValidation = from "./../../validation/queue/MessageExists"),
  PopReceiptValidation = from "./../../validation/queue/PopReceipt"),
  VisibilityTimeoutValueValidation = from "./../../validation/queue/VisibilityTimeoutValue"),
  MessageExpired = from "./../../validation/queue/MessageExpired"),
  NumOfSignedIdentifiersVal = from "./../../validation/NumOfSignedIdentifiers");

export default (req, res, next) => {
  BbPromise.try(() => {
    const request = req.azuriteRequest || {};
    const { queue, message } = QueueManager.getQueueAndMessage({
      queueName: request.queueName,
      messageId: request.messageId
    });
    const validationContext = new ValidationContext({
      request,
      queue,
      message,
      operation: req.azuriteOperation
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

validations[undefined] = () => {
  // NO VALIDATIONS (this is an unimplemented call)
};

validations[Operations.Queue.LIST_QUEUES] = valContext => {
  // NO VALIDATIONS
};

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
