import DataLakeServer from "./DataLakeServer";
import SqlDataLakeServer from "./SqlDataLakeServer";
import {
  DEFAULT_DATA_LAKE_EXTENT_LOKI_DB_PATH,
  DEFAULT_DATA_LAKE_LISTENING_PORT,
  DEFAULT_DATA_LAKE_LOKI_DB_PATH,
  DEFAULT_DATA_LAKE_PERSISTENCE_ARRAY,
  DEFAULT_DATA_LAKE_PERSISTENCE_PATH,
  DEFAULT_DATA_LAKE_SERVER_HOST_NAME} from "./utils/constants";
import IBlobEnvironment from "../blob/IBlobEnvironment";
import { BlobServerFactory } from "../blob/BlobServerFactory";

export class DataLakeServerFactory extends BlobServerFactory {
  public override async createServer(
    blobEnvironment?: IBlobEnvironment
  ): Promise<DataLakeServer | SqlDataLakeServer> {
    return this.createActualServer(
      blobEnvironment, 
      DEFAULT_DATA_LAKE_PERSISTENCE_ARRAY,
      DEFAULT_DATA_LAKE_PERSISTENCE_PATH,
      "AZURITE_DATALAKE_DB",
      DEFAULT_DATA_LAKE_SERVER_HOST_NAME,
      DEFAULT_DATA_LAKE_LISTENING_PORT,
      DEFAULT_DATA_LAKE_LOKI_DB_PATH,
      DEFAULT_DATA_LAKE_EXTENT_LOKI_DB_PATH,
      SqlDataLakeServer,
      DataLakeServer,
      "datalakeHost",
      "datalakePort"
    );
  }
}
