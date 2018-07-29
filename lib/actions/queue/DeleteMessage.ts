const QueueManager = from "./../../core/queue/QueueManager"),
  AzuriteQueueResponse = from "./../../model/queue/AzuriteQueueResponse");

class DeleteMessage {
  public process(request, res) {
    const queue = QueueManager.getQueueAndMessage({
      queueName: request.queueName
    }).queue;
    queue.delete(request.messageId, request.popReceipt);
    const response = new AzuriteQueueResponse();
    res.set(response.httpProps);
    res.status(204).send();
  }
}

export default new DeleteMessage();
