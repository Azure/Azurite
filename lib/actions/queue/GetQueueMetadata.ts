import N from "./../../core/HttpHeaderNames";
import QueueManager from "./../../core/queue/QueueManager";
import AzuriteQueueResponse from "./../../model/queue/AzuriteQueueResponse";

class GetQueueMetadata {
  public process(request, res) {
    const queue = QueueManager.getQueueAndMessage({
      queueName: request.queueName
    }).queue;

    const metaProps = queue.metaProps;
    const queueLength = queue.getLength();
    const response = new AzuriteQueueResponse();
    response.addMetaProps(metaProps);
    response.addHttpProperty(N.APPROXIMATE_MESSAGES_COUNT, queueLength);
    res.set(response.httpProps);
    res.status(200).send();
  }
}

export default new GetQueueMetadata();
