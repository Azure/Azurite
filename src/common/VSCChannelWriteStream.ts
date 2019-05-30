import { Writable } from "stream";
import { OutputChannel, window } from "vscode";

export default class VSCChannelWriteStream extends Writable
  implements NodeJS.WritableStream {
  private readonly channel: OutputChannel;

  /**
   * Creates an instance of VSCChannelWriteStream.
   *
   * @param {string} channelName Log to specific channel
   * @memberof VSCChannelWriteStream
   */
  public constructor(public readonly channelName: string) {
    super();
    this.channel = window.createOutputChannel(channelName);
  }

  public _write(
    chunk: any,
    encoding: string,
    callback: (error?: Error | null) => void
  ): void {
    this.channel.append(typeof chunk === "string" ? chunk : chunk.toString());
    callback();
  }
}
