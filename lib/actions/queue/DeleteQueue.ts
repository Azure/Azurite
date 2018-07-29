const QueueManager = require("./../../core/queue/QueueManager"),
  AzuriteQueueResponse = require("./../../model/queue/AzuriteQueueResponse");

class DeleteQueue {
  constructor() {}

  process(request, res) {
    QueueManager.delete(request.queueName);
    const response = new AzuriteQueueResponse();
    res.set(response.httpProps);
    res.status(204).send();
  }
}

export default new DeleteQueue();
