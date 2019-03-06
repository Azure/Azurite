import * as http from "http";
import * as https from "https";

export type RequestListener = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
) => void;

/**
 * Abstract Server class for Azurite Servers.
 *
 * @export
 * @abstract
 * @class Server
 */
export default abstract class Server {
  /**
   * Creates an instance of HTTP or HTTPS server.
   *
   * @param {string} host Server host,for example, "127.0.0.1"
   * @param {number} port Server port, for example, 10000
   * @param {http.Server | https.Server} httpServer A HTTP or HTTPS server instance without request listener binded
   * @memberof Server
   */
  public constructor(
    public readonly host: string,
    public readonly port: number,
    protected readonly httpServer: http.Server | https.Server,
    protected readonly requestListener: RequestListener,
  ) {
    // Remove predefined request listeners to avoid double request handling
    this.httpServer.removeAllListeners("request");
    this.httpServer.on("request", requestListener);
  }

  /**
   * Initialize and start the server to service incoming HTTP requests.
   *
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  public async start(): Promise<void> {
    await this.beforeStart();

    await new Promise<void>((resolve, reject) => {
      this.httpServer.listen(this.port, this.host, resolve).on("error", reject);
    });

    await this.afterStart();
  }

  /**
   * Dispose HTTP server and clean up other resources.
   *
   * We name this method as close instead of dispose, because in practices, usually we cannot re-open the resources
   * disposed, but can re-open the resources closed.
   *
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  public async close(): Promise<void> {
    await this.beforeClose();

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
  }

  /**
   * Async task before server starts.
   *
   * @protected
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  protected abstract async beforeStart(): Promise<void>;

  /**
   * Async task after server starts.
   *
   * @protected
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  protected abstract async afterStart(): Promise<void>;

  /**
   * Async task before server closes.
   *
   * @protected
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  protected abstract async beforeClose(): Promise<void>;

  /**
   * Async task after server closes.
   *
   * @protected
   * @abstract
   * @returns {Promise<void>}
   * @memberof Server
   */
  protected abstract async afterClose(): Promise<void>;
}
