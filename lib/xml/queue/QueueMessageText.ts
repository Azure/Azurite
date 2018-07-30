import * as js2xml from "js2xmlparser";
import * as xml2js from "xml2js";
import { asyncIt } from "../../lib/asyncIt";
import AzuriteError from "./../../core/AzuriteError";
import ErrorCode from "./../../core/ErrorCodes";

const xml2jsAsync = (str: string) =>
  asyncIt(cb => new xml2js.parseString(str, cb));
class QueueMessageText {
  public static toJs(body) {
    const xml = body.toString("utf8");
    if (xml.length === 0) {
      return new QueueMessageText(undefined);
    }
    return xml2jsAsync(xml)
      .then((result: any) => {
        return new QueueMessageText(result.QueueMessage.MessageText[0]);
      })
      .catch(error => {
        throw new AzuriteError(ErrorCode.InvalidXml);
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
