/** @format */

import * as BbPromise from 'bluebird';
import AError from './../../core/AzuriteError';
import ErrorCode from './../../core/ErrorCodes';
import js2xml from 'js2xmlparser';
import xml2js from 'xml2js';

const xml2jsAsync = BbPromise.promisify(xml2js.parseString);

class QueueMessageText {
  constructor(msg = undefined) {
    this.MessageText = msg;
  }

  static toJs(body) {
    const xml = body.toString("utf8");
    if (xml.length === 0) {
      return BbPromise.resolve(new QueueMessageText(undefined));
    }
    return xml2jsAsync(xml)
      .then((result) => {
        return new QueueMessageText(result.QueueMessage.MessageText[0]);
      })
      .catch((err) => {
        throw new AError(ErrorCode.InvalidXml);
      });
  }

  toXml() {
    const xml = js2xml.parse("QueueMessage", this);
    return xml.replace(/\>[\s]+\</g, "><");
  }
}

export default QueueMessageText;