import * as js2xml from "js2xmlparser";

export class QueueMessagesListXmlModel {
  public QueueMessage: any[];
  constructor() {
    this.QueueMessage = [];
  }

  public add(msg) {
    this.QueueMessage.push(msg);
  }

  public toXml() {
    const xml = js2xml.parse("QueueMessagesList", this);
    return xml.replace(/\>[\s]+\</g, "><");
  }
}

export class QueueMessageXmlModel {
  public MessageId: any;
  public InsertionTime: any;
  public ExpirationTime: any;
  public PopReceipt: any;
  public TimeNextVisible: any;
  public DequeueCount: any;
  public MessageText: any;
  constructor({
    dequeueCount,
    expirationTime,
    insertionTime,
    messageId,
    messageText,
    popReceipt,
    timeNextVisible
  }) {
    this.MessageId = messageId;
    this.MessageId === undefined
      ? delete this.MessageId
      : // tslint:disable-next-line:no-unused-expression
        () => {
          /*NOOP*/
        };
    this.InsertionTime = insertionTime;
    this.InsertionTime === undefined
      ? delete this.InsertionTime
      : // tslint:disable-next-line:no-unused-expression
        () => {
          /*NOOP*/
        };
    this.ExpirationTime = expirationTime;
    this.ExpirationTime === undefined
      ? delete this.ExpirationTime
      : // tslint:disable-next-line:no-unused-expression
        () => {
          /*NOOP*/
        };
    this.PopReceipt = popReceipt;
    this.PopReceipt === undefined
      ? delete this.PopReceipt
      : // tslint:disable-next-line:no-unused-expression
        () => {
          /*NOOP*/
        };
    this.TimeNextVisible = timeNextVisible;
    this.TimeNextVisible === undefined
      ? delete this.TimeNextVisible
      : // tslint:disable-next-line:no-unused-expression
        () => {
          /*NOOP*/
        };
    this.DequeueCount = dequeueCount;
    this.DequeueCount === undefined
      ? delete this.DequeueCount
      : // tslint:disable-next-line:no-unused-expression
        () => {
          /*NOOP*/
        };
    this.MessageText = messageText;
    this.MessageText === undefined
      ? delete this.MessageText
      : // tslint:disable-next-line:no-unused-expression
        () => {
          /*NOOP*/
        };
  }
}
