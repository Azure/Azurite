import Operation from "./artifacts/operation";

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
   * @memberof Context
   */
  // tslint:disable-next-line:ban-types
  public constructor(holder: Object, path: string);
  public constructor(
    // tslint:disable-next-line:ban-types
    holderOrContext: Object | Context,
    path: string = "context"
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
    }
  }

  public get operation(): Operation | undefined {
    return this.context.operation;
  }

  public set operation(operation: Operation | undefined) {
    this.context.operation = operation;
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
