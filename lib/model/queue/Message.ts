import uuid from "uuid";

/**
 * Abstraction of a queue message.
 *
 * @class Message
 */
class Message {
  public msg: any;
  public expirationTime: any;
  public visibilityTimeout: any;
  public timeNextVisible: any;
  public messageId: string;
  public insertionTime: any;
  public popReceipt: string;
  public dequeueCount: number;
  /**
   * Creates an instance of message.
   * @param {String} msg the queue message.
   * @param {any} visibilityTimeout defines the time interval it is not visible to other clients
   * after it has been retrieved
   * @param {any} messageTtl time to live of the message
   * @memberof Item
   */
  constructor(now, msg, visibilityTimeout, messageTtl) {
    this.msg = msg;
    this.expirationTime = now + messageTtl;
    this.visibilityTimeout = visibilityTimeout;
    this.timeNextVisible = now + visibilityTimeout;
    this.messageId = uuid.v4();
    this.insertionTime = now;
    this.popReceipt = uuid.v4();
    this.dequeueCount = 0;
  }

  public renewPopReceipt() {
    this.popReceipt = uuid.v4();
  }

  public visible() {
    const now = new Date().getTime() / 1000;
    return this.timeNextVisible === undefined || now >= this.timeNextVisible;
  }

  public updateVisibilityTimeout(visibilityTimeout) {
    this.visibilityTimeout = visibilityTimeout;
    const now = new Date().getTime() / 1000;
    this.timeNextVisible = now + this.visibilityTimeout;
  }
}

export default Message;
