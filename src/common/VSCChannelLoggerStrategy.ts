import { OutputChannel, window } from "vscode";

import ILoggerStrategy, { LogLevels } from "./ILoggerStrategy";

/**
 * A logger strategy can log to Visual Studio Code channel.
 *
 * @export
 * @class VSCChannelLoggerStrategy
 * @implements {ILoggerStrategy}
 */
export default class VSCChannelLoggerStrategy implements ILoggerStrategy {
  private readonly channel: OutputChannel;

  /**
   * Creates an instance of VSCChannelLoggerStrategy.
   *
   * @param {string} channelName Log to specific channel
   * @param {LogLevels} [level=LogLevels.Debug]
   * @memberof VSCChannelLoggerStrategy
   */
  public constructor(
    public readonly channelName: string,
    public readonly level: LogLevels = LogLevels.Debug
  ) {
    this.channel = window.createOutputChannel(channelName);
  }

  public log(
    level: LogLevels,
    message: string,
    contextID: string = "\t"
  ): void {
    this.channel.appendLine(
      `${new Date().toISOString()} ${contextID} ${level} ${message}`
    );
  }
}
