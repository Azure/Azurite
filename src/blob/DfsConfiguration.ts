import ConfigurationBase from "../common/ConfigurationBase";
import {
  DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
  DEFAULT_DFS_LISTENING_PORT,
  DEFAULT_DFS_SERVER_HOST_NAME
} from "./utils/constants";

export default class DfsConfiguration extends ConfigurationBase {
  public constructor(
    host: string = DEFAULT_DFS_SERVER_HOST_NAME,
    port: number = DEFAULT_DFS_LISTENING_PORT,
    keepAliveTimeout: number = DEFAULT_BLOB_KEEP_ALIVE_TIMEOUT,
    cert: string = "",
    key: string = "",
    pwd: string = ""
  ) {
    super(
      host,
      port,
      keepAliveTimeout,
      false,
      undefined,
      false,
      undefined,
      false,
      false,
      cert,
      key,
      pwd,
      undefined,
      false
    );
  }
}
