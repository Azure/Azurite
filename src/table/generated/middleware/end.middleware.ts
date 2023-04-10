import Context from "../Context";
import IResponse from "../IResponse";
import ILogger from "../utils/ILogger";

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

  logger.info(
    // tslint:disable-next-line:max-line-length
    `[${context.request?.getMethod()}] ${context.request?.getPath()} TableEndMiddleware: End response. TotalTimeInMS=${totalTimeInMS} StatusCode=${res.getStatusCode()} StatusMessage=${res.getStatusMessage()} Headers=${JSON.stringify(
      res.getHeaders()
    )} Request Body: ${context.request?.getBody()} Response Body: ${context.response?.getBodyStream()}`,
    context.contextID
  );

  res.getBodyStream().end();
}
