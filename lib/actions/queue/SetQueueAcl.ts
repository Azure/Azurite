import QueueManager from "./../../core/queue/QueueManager";
import AzuriteQueueResponse from "./../../model/queue/AzuriteQueueResponse";

class SetQueueAcl {
  public process(request, res) {
    const { queue } = QueueManager.getQueueAndMessage(request.queueName);
    queue.addAcl(request.payload.SignedIdentifier);
    const response = new AzuriteQueueResponse();
    res.set(response.httpProps);
    res.status(204).send();
  }
}

export default new SetQueueAcl();
