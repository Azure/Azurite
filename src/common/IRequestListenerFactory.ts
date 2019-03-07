import { RequestListener } from "./ServerBase";

/**
 * Factory interface to create HTTP or HTTPS server request listeners, like using express().
 *
 * @export
 * @interface IRequestListenerFactory
 */
export default interface IRequestListenerFactory {
  createRequestListener(): RequestListener;
}
