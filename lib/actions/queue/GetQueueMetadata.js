/** @format */

import QueueManager from './../../core/queue/QueueManager';
import N from './../../core/HttpHeaderNames';
import AzuriteQueueResponse from './../../model/queue/AzuriteQueueResponse';

class GetQueueMetadata {
  constructor() {}

  process(request, res) {
    const queue = QueueManager.getQueueAndMessage({
        queueName: request.queueName,
      }).queue,
      metaProps = queue.metaProps,
      queueLength = queue.getLength(),
      response = new AzuriteQueueResponse();
    response.addMetaProps(metaProps);
    response.addHttpProperty(N.APPROXIMATE_MESSAGES_COUNT, queueLength);
    res.set(response.httpProps);
    res.status(200).send();
  }
}

export default new GetQueueMetadata();
