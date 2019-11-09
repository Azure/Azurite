import ICleaner from "./ICleaner";
import IDataStore from "./IDataStore";

/**
 * Account properties.
 *
 * @interface IAccountProperties
 */
export interface IAccountProperties {
  name: string;
  key1: Buffer;
  key2?: Buffer;
}

export default interface IAccountDataStore extends IDataStore, ICleaner {
  getAccount(name: string): IAccountProperties | undefined;
}
