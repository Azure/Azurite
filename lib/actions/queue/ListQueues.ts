import N from "./../../core/HttpHeaderNames";
import QueueManager from "./../../core/queue/QueueManager";
import AzuriteQueueResponse from "./../../model/queue/AzuriteQueueResponse";
import { QueueListXmlModel, QueueXmlModel } from "./../../xml/queue/QueueList";

class ListQueues {
  public process(request, res) {
    const query = request.query;
    const { queues, nextMarker } = QueueManager.listQueues({
      marker: query.marker,
      maxresults: query.maxresults,
      prefix: query.prefix
    });

    const xmlModel = new QueueListXmlModel();
    for (const queue of queues) {
      const xmlQueue = new QueueXmlModel(queue.name);
      if (request.query.include === "metadata") {
        xmlQueue.addMetadata(queue.metaProps);
      }
      xmlModel.add(xmlQueue);
    }
    if (nextMarker !== undefined) {
      xmlModel.NextMarker = nextMarker;
    }
    const xmlString = xmlModel.toXml();
    const response = new AzuriteQueueResponse();
    response.addHttpProperty(N.CONTENT_TYPE, "application/xml");
    res.set(response.httpProps);
    res.status(200).send(xmlString);
  }
}

export default new ListQueues();
