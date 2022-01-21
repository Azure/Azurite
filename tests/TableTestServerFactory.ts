import TableConfiguration from "../src/table/TableConfiguration";
import TableServer from "../src/table/TableServer";

export default class TableTestServerFactory {
  public createServer(
    loose: boolean = false,
    skipApiVersionCheck: boolean = false,
    https: boolean = false,
    oauth?: string
  ): TableServer {
    const port = 11002;
    const host = "127.0.0.1";

    const cert = https ? "tests/server.cert" : undefined;
    const key = https ? "tests/server.key" : undefined;

    const lokiMetadataDBPath = "__test_db_table__.json";
    const config = new TableConfiguration(
      host,
      port,
      lokiMetadataDBPath,
      false,
      false,
      undefined,
      "debug-test-table.log",
      loose,
      skipApiVersionCheck,
      cert,
      key,
      undefined,
      oauth
    );
    return new TableServer(config);
  }
}
