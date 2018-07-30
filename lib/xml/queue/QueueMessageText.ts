import BbPromise from "bluebird";
import * as js2xml from "js2xmlparser";
import * as xml2js from "xml2js";
import AError from "./../../core/AzuriteError";
import ErrorCode from "./../../core/ErrorCodes";

const xml2jsAsync = BbPromise.promisify(xml2js.parseString);
class QueueMessageText {
  public static toJs(body) {
    const xml = body.toString("utf8");
    if (xml.length === 0) {
      return BbPromise.resolve(new QueueMessageText(undefined));
    }
    return xml2jsAsync(xml)
      .then(result => {
        return new QueueMessageText(result.QueueMessage.MessageText[0]);
      })
      .catch(err => {
        throw new AError(ErrorCode.InvalidXml);
      });
  }
  public MessageText: any;
  constructor(msg?: any) {
    this.MessageText = msg;
  }

  public toXml() {
    const xml = js2xml.parse("QueueMessage", this);
    return xml.replace(/\>[\s]+\</g, "><");
  }
}

export default QueueMessageText;
