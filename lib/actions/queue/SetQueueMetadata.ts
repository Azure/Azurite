import QueueManager from "./../../core/queue/QueueManager";
import AzuriteQueueResponse from "./../../model/queue/AzuriteQueueResponse";

class SetQueueMetadata {
  public process(request, res) {
    QueueManager.setQueueMetadata(request);
    const response = new AzuriteQueueResponse();
    res.set(response.httpProps);
    res.status(204).send();
  }
}

export default new SetQueueMetadata();
