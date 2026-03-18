import * as http from "http";
import * as https from "https";

import IAccountDataStore from "../common/IAccountDataStore";
import { CertOptions } from "../common/ConfigurationBase";
import { OAuthLevel } from "../common/models";
import IExtentStore from "../common/persistence/IExtentStore";
import ServerBase from "../common/ServerBase";
import DfsConfiguration from "./DfsConfiguration";
import DfsRequestListenerFactory from "./DfsRequestListenerFactory";
import IBlobMetadataStore from "./persistence/IBlobMetadataStore";

export default class DfsServer extends ServerBase {
  public constructor(
    configuration: DfsConfiguration,
    metadataStore: IBlobMetadataStore,
    extentStore: IExtentStore,
    accountDataStore: IAccountDataStore,
    oauth?: OAuthLevel,
    enableHierarchicalNamespace: boolean = true
  ) {
    let httpServer;
    const certOption = configuration.hasCert();
    switch (certOption) {
      case CertOptions.PEM:
      case CertOptions.PFX:
        httpServer = https.createServer(configuration.getCert(certOption)!);
        break;
      default:
        httpServer = http.createServer();
    }

    const requestListenerFactory = new DfsRequestListenerFactory(
      metadataStore,
      extentStore,
      accountDataStore,
      oauth,
      enableHierarchicalNamespace
    );

    super(
      configuration.host,
      configuration.port,
      httpServer,
      requestListenerFactory,
      configuration
    );
  }
}
