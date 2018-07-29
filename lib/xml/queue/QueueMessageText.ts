const BbPromise = require("bluebird"),
  AError = require("./../../core/AzuriteError"),
  ErrorCode = require("./../../core/ErrorCodes"),
  xml2jsAsync = BbPromise.promisify(require("xml2js").parseString),
  js2xml = require("js2xmlparser");

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
      .then(result => {
        return new QueueMessageText(result.QueueMessage.MessageText[0]);
      })
      .catch(err => {
        throw new AError(ErrorCode.InvalidXml);
      });
  }

  toXml() {
    const xml = js2xml.parse("QueueMessage", this);
    return xml.replace(/\>[\s]+\</g, "><");
  }
}

export default QueueMessageText;
