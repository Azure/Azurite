import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME
} from "../blob/utils/constants";
import IAccountDataStore, { IAccountProperties } from "./IAccountDataStore";

enum Status {
  Initializing,
  Initialized,
  Closing,
  Closed
}

export default class AccountDataStore implements IAccountDataStore {
  private status: Status = Status.Closed;

  public getAccount(name: string): IAccountProperties | undefined {
    if (name === EMULATOR_ACCOUNT_NAME) {
      return {
        name: EMULATOR_ACCOUNT_NAME,
        key1: EMULATOR_ACCOUNT_KEY
      };
    } else {
      return undefined;
    }
  }

  public async init(): Promise<void> {
    this.status = Status.Initialized;
  }

  public isInitialized(): boolean {
    return this.status === Status.Initialized;
  }

  public async close(): Promise<void> {
    this.status = Status.Closed;
  }

  public isClosed(): boolean {
    return this.status === Status.Closed;
  }

  public async clean(): Promise<void> {
    /* NOOP */
  }
}
