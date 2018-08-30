/** @format */

import QueueManager from './../../core/queue/QueueManager';
import { QueueList as QueueListXmlModel } from './../../xml/queue/QueueList';
import { Queue as QueueXmlModel } from './../../xml/queue/QueueList';
import AzuriteQueueResponse from './../../model/queue/AzuriteQueueResponse';
import N from './../../core/HttpHeaderNames';

class ListQueues {
  constructor() {}

  process(request, res) {
    const query = request.query;
    const { queues, nextMarker } = QueueManager.listQueues({
      prefix: query.prefix,
      marker: query.marker,
      maxresults: query.maxresults,
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