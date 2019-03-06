import { RequestListener } from "./Server";

/**
 * Factory to create HTTP or HTTPS server request listeners, like using express().
 *
 * @export
 * @interface IRequestListenerFactory
 */
export default interface IRequestListenerFactory {
  createRequestListener(): RequestListener;
}
