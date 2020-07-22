import Operation from "./artifacts/operation";
import IRequest from "./IRequest";
import IResponse from "./IResponse";

export interface IHandlerParameters {
  [key: string]: any;
}

/**
 * Context holds generated server context information.
 * Every incoming HTTP request will initialize a new context.
 *
 * @export
 * @class Context
 */
export default class Context {
  public readonly context: any;
  public readonly path: string;

  /**
   * Creates an instance of Context.
   * Context holds generated server context information.
   * Every incoming HTTP request will initialize a new context.
   *
   * @param {Context} context An existing Context
   * @memberof Context
   */
  public constructor(context: Context);

  /**
   * Creates an instance of Context.
   * Context holds generated server context information.
   * Every incoming HTTP request will initialize a new context.
   *
   * @param {Object} holder Holder is an Object which used to keep context information
   * @param {string} [path="context"] holder[path] is used as context object by default
   * @param {IRequest} [req]
   * @param {IResponse} [res]
   * @memberof Context
   */
  public constructor(
    holder: object,
    path: string,
    req?: IRequest,
    res?: IResponse
  );

  public constructor(
    holderOrContext: object | Context,
    path: string = "context",
    req?: IRequest,
    res?: IResponse
  ) {
    if (holderOrContext instanceof Context) {
      this.context = holderOrContext.context;
      this.path = holderOrContext.path;
    } else {
      const context = holderOrContext as any;
      this.path = path;

      if (context[this.path] === undefined) {
        context[this.path] = {};
      }

      if (typeof context[this.path] !== "object") {
        throw new TypeError(
          `Initialize Context error because holder.${
            this.path
          } is not an object.`
        );
      }

      this.context = context[this.path];

      this.request = req;
      this.response = res;
    }
  }

  public get operation(): Operation | undefined {
    return this.context.operation;
  }

  public set operation(operation: Operation | undefined) {
    this.context.operation = operation;
  }

  public set request(request: IRequest | undefined) {
    this.context.request = request;
  }

  public get request(): IRequest | undefined {
    return this.context.request;
  }

  public get dispatchPattern(): string | undefined {
    return this.context.dispatchPattern;
  }

  public set dispatchPattern(path: string | undefined) {
    this.context.dispatchPattern = path;
  }

  public set response(response: IResponse | undefined) {
    this.context.response = response;
  }

  public get response(): IResponse | undefined {
    return this.context.response;
  }

  public get handlerParameters(): IHandlerParameters | undefined {
    return this.context.handlerParameters;
  }

  public set handlerParameters(
    handlerParameters: IHandlerParameters | undefined
  ) {
    this.context.handlerParameters = handlerParameters;
  }

  public get handlerResponses(): any {
    return this.context.handlerResponses;
  }

  public set handlerResponses(handlerResponses: any) {
    this.context.handlerResponses = handlerResponses;
  }

  public get contextID(): string | undefined {
    return this.context.contextID;
  }

  public set contextID(contextID: string | undefined) {
    this.context.contextID = contextID;
  }

  public set startTime(startTime: Date | undefined) {
    this.context.startTime = startTime;
  }

  public get startTime(): Date | undefined {
    return this.context.startTime;
  }
}
