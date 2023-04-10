import Context from '../Context';
import IResponse from '../IResponse';
import ILogger from '../utils/ILogger';

/**
 * End middleware is used to send out final HTTP response.
 *
 * @export
 * @param {Context} context
 * @param {Request} req An express compatible Request object
 * @param {Response} res An express compatible Response object
 * @param {ILogger} logger A valid logger
 */
export default function endMiddleware(
  context: Context,
  res: IResponse,
  logger: ILogger,
): void {
  const totalTimeInMS = context.startTime
    ? new Date().getTime() - context.startTime.getTime()
    : undefined;

  // tslint:disable-next-line
  context.meta.statusCode = res.getStatusCode();
  if(res.getHeaders() && res.getHeader('content-length')) {
      context.meta.outputLen = res.getHeader('content-length');
  }
  console.log(context.meta);
  logger.info(
    // tslint:disable-next-line:max-line-length
    `BlobEndMiddleware: End response. TotalTimeInMS=${totalTimeInMS} StatusCode=${res.getStatusCode()} StatusMessage=${res.getStatusMessage()} Headers=${JSON.stringify(
      res.getHeaders()
    )} Meta=${JSON.stringify(
      context.meta
    )}`,
    context.contextId
  );

  res.getBodyStream().end();
}
