const BbPromise = from "bluebird"),
  AError = from "./../../core/AzuriteError"),
  ErrorCode = from "./../../core/ErrorCodes"),
  xml2jsAsync = BbPromise.promisify(from "xml2js").parseString),
  js2xml = from "js2xmlparser");

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
  constructor(msg = undefined) {
    this.MessageText = msg;
  }

  public toXml() {
    const xml = js2xml.parse("QueueMessage", this);
    return xml.replace(/\>[\s]+\</g, "><");
  }
}

export default QueueMessageText;
