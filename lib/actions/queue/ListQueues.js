/** @format */

"use strict";

const QueueManager = require("./../../core/queue/QueueManager"),
  QueueListXmlModel = require("./../../xml/queue/QueueList").QueueList,
  QueueXmlModel = require("./../../xml/queue/QueueList").Queue,
  AzuriteQueueResponse = require("./../../model/queue/AzuriteQueueResponse"),
  N = require("./../../core/HttpHeaderNames");

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

module.exports = new ListQueues();
