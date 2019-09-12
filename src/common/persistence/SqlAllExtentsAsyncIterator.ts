/**
 * Async iterator to enumerate all extent IDs.
 *
 * @export
 * @class SqlAllExtentsAsyncIterator
 * @implements {AsyncIterator<string[]>}
 */
export default class SqlAllExtentsAsyncIterator
  implements AsyncIterator<string[]> {
  public async next(): Promise<IteratorResult<string[]>> {
    return { done: true, value: [] };
  }
}
