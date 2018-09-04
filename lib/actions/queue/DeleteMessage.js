/** @format */

"use strict";

const QueueManager = require("./../../core/queue/QueueManager"),
  AzuriteQueueResponse = require("./../../model/queue/AzuriteQueueResponse");

class DeleteMessage {
  constructor() {}

  process(request, res) {
    const queue = QueueManager.getQueueAndMessage({
      queueName: request.queueName,
    }).queue;
    queue.delete(request.messageId, request.popReceipt);
    const response = new AzuriteQueueResponse();
    res.set(response.httpProps);
    res.status(204).send();
  }
}

module.exports = new DeleteMessage();
