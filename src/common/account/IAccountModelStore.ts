import ICleaner from "../ICleaner";
import IDataStore from "../IDataStore";
import { AccountModel } from "./AccountModel";

export default interface IAccountModelStore extends IDataStore, ICleaner {
  getAccountModel(accountName: string): AccountModel | undefined;
  isBlobVersioningEnabled(accountName: string): boolean;
  hasBlobVersioningEnabled(): boolean;
}
