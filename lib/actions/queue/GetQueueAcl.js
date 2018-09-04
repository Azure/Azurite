/** @format */

"use strict";

import QueueManager from './../../core/queue/QueueManager';
import js2xmlparser from 'js2xmlparser';
import AzuriteQueueResponse from './../../model/queue/AzuriteQueueResponse';
import N from './../../core/HttpHeaderNames';

class GetQueueAcl {
  constructor() {}

  process(request, res) {
    const queue = QueueManager.getQueueAndMessage({
        queueName: request.queueName,
      }).queue,
      signedIdentifiers = queue.getAcl();
    let xml = js2xmlparser.parse("SignedIdentifiers", signedIdentifiers || {});
    xml = xml.replace(
      `<?xml version='1.0'?>`,
      `<?xml version="1.0" encoding="utf-8"?>`
    );
    const response = new AzuriteQueueResponse();
    response.addHttpProperty(N.CONTENT_TYPE, "application/xml");
    res.set(response.httpProps);
    res.status(200).send(xml);
  }
}

export default new GetQueueAcl();
