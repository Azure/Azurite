const QueueManager = require("./../../core/queue/QueueManager"),
  AzuriteQueueResponse = require("./../../model/queue/AzuriteQueueResponse");

class SetQueueMetadata {
  constructor() {}

  process(request, res) {
    QueueManager.setQueueMetadata(request);
    const response = new AzuriteQueueResponse();
    res.set(response.httpProps);
    res.status(204).send();
  }
}

export default new SetQueueMetadata();
