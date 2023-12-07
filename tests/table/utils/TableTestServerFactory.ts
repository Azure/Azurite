import TableConfiguration from "../../../src/table/TableConfiguration";
import TableServer from "../../../src/table/TableServer";

export interface ITableTestServerFactoryParams {
  metadataDBPath: string
  enableDebugLog: boolean
  debugLogFilePath: string
  loose: boolean
  skipApiVersionCheck: boolean
  https: boolean
  oauth?: string
}

export default class TableTestServerFactory {
  public static inMemoryPersistence() {
    return process.env.AZURITE_TEST_INMEMORYPERSISTENCE !== undefined;
  }

  public createServer(params: ITableTestServerFactoryParams): TableServer {
    const inMemoryPersistence = TableTestServerFactory.inMemoryPersistence()

    const port = 11002;
    const host = "127.0.0.1";

    const cert = params.https ? "tests/server.cert" : undefined;
    const key = params.https ? "tests/server.key" : undefined;

    const config = new TableConfiguration(
      host,
      port,
      params.metadataDBPath,
      params.enableDebugLog,
      false,
      undefined,
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
    return new TableServer(config);
  }
}
