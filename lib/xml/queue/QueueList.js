/** @format */

"use strict";

import js2xml from 'js2xmlparser';

/*
 * These classes are used as model for XML-Serialization in the "ListQueues" API
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/list-queues1
*/
class QueueList {
  constructor() {
    this.Prefix = undefined;
    this.Marker = undefined;
    this.MaxResults = undefined;
    this.Queues = {
      Queue: [],
    };
    this.NextMarker = {}; // this will be converted to <NextMarker/> by js2xmlparser
  }

  add(queue) {
    this.Queues.Queue.push(queue);
  }

  toXml() {
    if (this.Prefix === undefined) {
      delete this.Prefix;
    }
    if (this.Marker === undefined) {
      delete this.Marker;
    }
    if (this.MaxResults === undefined) {
      delete this.MaxResults;
    }
    let xml = js2xml.parse("EnumerationResults", this);
    xml = xml.replace(
      `<EnumerationResults>`,
      `<EnumerationResults ServiceEndpoint="http://localhost:10001/devstoreaccount1">`
    );
    xml = xml.replace(
      `<?xml version='1.0'?>`,
      `<?xml version="1.0" encoding="utf-8"?>`
    );
    xml = xml.replace(/\>[\s]+\</g, "><");
    return xml;
  }
}

class Queue {
  constructor(name) {
    this.Name = name;
  }

  addMetadata(metaProps) {
    this.Metadata = metaProps;
  }
}

export default {
  QueueList: QueueList,
  Queue: Queue,
};
