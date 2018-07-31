import * as js2xmlparser from "js2xmlparser";
import N from "./../../core/HttpHeaderNames";
import QueueManager from "./../../core/queue/QueueManager";
import AzuriteQueueResponse from "./../../model/queue/AzuriteQueueResponse";

class GetQueueAcl {
  public process(request, res) {
    const { queue } = QueueManager.getQueueAndMessage(request.queueName);
    const signedIdentifiers = queue.getAcl();
    let xml = js2xmlparser.parse("SignedIdentifiers", signedIdentifiers || {});
    xml = xml.replace(
      `<?xml version="1.0"?>`,
      `<?xml version="1.0" encoding="utf-8"?>`
    );
    const response = new AzuriteQueueResponse();
    response.addHttpProperty(N.CONTENT_TYPE, "application/xml");
    res.set(response.httpProps);
    res.status(200).send(xml);
  }
}

export default new GetQueueAcl();
