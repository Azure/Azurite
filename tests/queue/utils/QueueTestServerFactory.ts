import { StoreDestinationArray } from "../../../src/common/persistence/IExtentStore"
import QueueConfiguration from "../../../src/queue/QueueConfiguration"
import QueueServer from "../../../src/queue/QueueServer"
import { DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT } from "../../../src/queue/utils/constants";

export interface IQueueTestServerFactoryParams {
  metadataDBPath: string
  extentDBPath: string
  persistencePathArray: StoreDestinationArray
  enableDebugLog?: boolean
  debugLogFilePath?: string
  loose?: boolean
  skipApiVersionCheck?: boolean
  https?: boolean
  oauth?: string
}

export default class QueueTestServerFactory {
  public createServer(params: IQueueTestServerFactoryParams): QueueServer {
    const inMemoryPersistence = process.env.AZURITE_TEST_INMEMORYPERSISTENCE !== undefined;

    const port = 11001;
    const host = "127.0.0.1";

    const cert = params.https ? "tests/server.cert" : undefined;
    const key = params.https ? "tests/server.key" : undefined;

    const config = new QueueConfiguration(
      host,
      port,
      DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT,
      params.metadataDBPath,
      params.extentDBPath,
      params.persistencePathArray,
      false,
      undefined,
      params.enableDebugLog,
      params.debugLogFilePath,
      params.loose,
      params.skipApiVersionCheck,
      cert,
      key,
      undefined,
      params.oauth,
      undefined,
      inMemoryPersistence
    );
    return new QueueServer(config);
  }
}
