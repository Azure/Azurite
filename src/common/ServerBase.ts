import * as http from "http";
import * as https from "https";

import ConfigurationBase from "./ConfigurationBase";
import ICleaner from "./ICleaner";
import IRequestListenerFactory from "./IRequestListenerFactory";

export type RequestListener = (
  request: http.IncomingMessage,
  response: http.ServerResponse
) => void;

export enum ServerStatus {
  Closed = "Closed",
  Starting = "Starting",
  Running = "Running",
  Closing = "Closing"
}

/**
 * Abstract Server class for Azurite HTTP or HTTPS Servers.
 *
 * @export
 * @abstract
 * @class Server
 */
export default abstract class ServerBase implements ICleaner {
  protected status: ServerStatus = ServerStatus.Closed;

  /**
   * Creates an instance of HTTP or HTTPS server.
   *
   * @param {string} host Server host,for example, "127.0.0.1"
   * @param {number} port Server port, for example, 10000
   * @param {http.Server | https.Server} httpServer A HTTP or HTTPS server instance without request listener bound
   * @param {IRequestListenerFactory} requestListenerFactory A request listener factory
   * @memberof ServerBase
   */
  public constructor(
    public readonly host: string,
    public readonly port: number,
    public readonly httpServer: http.Server | https.Server,
    requestListenerFactory: IRequestListenerFactory,
    public readonly config: ConfigurationBase
  ) {
    // Remove predefined request listeners to avoid double request handling
    this.httpServer.removeAllListeners("request");
    this.httpServer.on(
      "request",
      requestListenerFactory.createRequestListener()
    );
  }

  /**
   * Get HTTP server listening address and port string.
   * Note this may be different from host and port parameters values, because
   * when port is 0, system will select a rand port number for listening.
   * This method will return the port and address being used.
   *
   * @returns {string}
   * @memberof ServerBase
   */
  public getHttpServerAddress(): string {
    const address = this.httpServer.address();
    const protocol = `http${this.config.hasCert() ? "s" : ""}://`;

    if (typeof address === "string") {
      return protocol + address;
    } else if (address === null) {
      return "";
    } else {
      return `${protocol}${address.address}:${address.port}`;
    }
  }

  public getStatus(): ServerStatus {
    return this.status;
  }

  /**
   * Initialize and start the server to server incoming HTTP requests.
   * beforeStart() and afterStart() will be executed before and after start().
   *
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  public async start(): Promise<void> {
    if (this.status !== ServerStatus.Closed) {
      throw Error(`Cannot start server in status ${ServerStatus[this.status]}`);
    }

    this.status = ServerStatus.Starting;

    try {
      await this.beforeStart();
      await new Promise<void>((resolve, reject) => {
        this.httpServer
          .listen(this.port, this.host, resolve)
          .on("error", reject);
      });

      this.status = ServerStatus.Running;
    } catch (err) {
      this.status = ServerStatus.Closed;
      throw err;
    }

    await this.afterStart();
  }

  /**
   * Dispose HTTP server and clean up other resources.
   *
   * beforeClose() and afterClose() will be executed before and after close().
   *
   * We name this method as close instead of dispose, because in practices, usually we cannot re-open the resources
   * disposed, but can re-open the resources closed.
   *
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  public async close(): Promise<void> {
    if (this.status !== ServerStatus.Running) {
      throw Error(`Cannot close server in status ${ServerStatus[this.status]}`);
    }

    this.status = ServerStatus.Closing;

    await this.beforeClose();

    // Remove request listener to reject incoming requests
    this.httpServer.removeAllListeners("request");

    // Close HTTP server first to deny incoming connections
    // You will find this will not close server immediately because there maybe existing keep-alive connections
    // Calling httpServer.close will only stop accepting incoming requests
    // and wait for existing keep-alive connections timeout
    // Default keep-alive timeout is 5 seconds defined by httpServer.keepAliveTimeout
    // TODO: Add a middleware to reject incoming request over existing keep-alive connections
    // https://github.com/nodejs/node/issues/2642
    await new Promise(resolve => {
      this.httpServer.close(resolve);
    });

    await this.afterClose();

    this.status = ServerStatus.Closed;
  }

  public async clean(): Promise<void> {
    /** NOOP */
  }

  /**
   * Async task before server starts.
   *
   * @protected
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  protected async beforeStart(): Promise<void> {
    /** NOOP */
  }

  /**
   * Async task after server starts.
   *
   * @protected
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  protected async afterStart(): Promise<void> {
    /** NOOP */
  }

  /**
   * Async task before server closes.
   *
   * @protected
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  protected async beforeClose(): Promise<void> {
    /** NOOP */
  }

  /**
   * Async task after server closes.
   *
   * @protected
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  protected async afterClose(): Promise<void> {
    /** NOOP */
  }
}
