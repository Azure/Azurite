export default class TableBatchUtils {
  /**
   * Helper to convert a ReadableStream to string.
   *
   * @static
   * @param {(NodeJS.ReadableStream | undefined)} stream
   * @return {*}  {Promise<string>}
   * @memberof TableBatchUtils
   */
  public static async StreamToString(
    stream: NodeJS.ReadableStream | undefined
  ): Promise<string> {
    if (stream === undefined) {
      throw new Error("undefined stream passed to function!");
    }
    const chunks: any[] = [];
    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  }
}
