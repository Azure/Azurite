'use strict';

const js2xml = require('js2xmlparser');

/*
 * These classes are used as model for XML-Serialization in the "ListQueues" API
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/list-queues1
*/
class QueueList {
    constructor() {
        this.Prefix = '';
        this.Marker = '';
        this.MaxResults = '';
        this.Queues = {
            Queue: []
        }
        this.NextMarker;
    }

    add(queue) {
        this.Queues.Queue.push(queue);
    }

    toXml() {
        let xml = js2xml.parse('EnumerationResults', this);
        xml = xml.replace(`<EnumerationResults>`, `<EnumerationResults ServiceEndpoint="http://localhost:10001/devstoreaccount1">`);
        xml = xml.replace(`<?xml version='1.0'?>`, `<?xml version="1.0" encoding="utf-8"?>`);
        xml = xml.replace(/\>[\s]+\</g, '><');
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

module.exports = {
    QueueList: QueueList,
    Queue: Queue
}