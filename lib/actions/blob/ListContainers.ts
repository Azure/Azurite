import * as js2xmlparser from "js2xmlparser";
import storageManager from "./../../core/blob/StorageManager";
import {
  Container,
  ContainerList
} from "./../../xml/blob/ContainerListXmlModel";

class ListContainers {
  public process(request, res) {
    const prefix = request.query.prefix || "";
    const maxresults = request.query.maxresults || "5000";
    const includeMetadata = request.query.include === "metadata" ? true : false;
    const marker = request.query.marker || "";

    storageManager.listContainer(request, prefix, maxresults).then(response => {
      response.addHttpProperty("content-type", "application/xml");
      res.set(response.httpProps);
      const transformedModel = this._transformContainerList(
        response.payload,
        includeMetadata,
        prefix,
        maxresults,
        marker
      );
      let xmlDoc = js2xmlparser.parse("EnumerationResults", transformedModel);
      xmlDoc = xmlDoc.replace(
        `<EnumerationResults>`,
        `<EnumerationResults ServiceEndpoint="http://localhost:10000/devstoreaccount1">`
      );
      xmlDoc = xmlDoc.replace(
        `<?xml version="1.0"?>`,
        `<?xml version="1.0" encoding="utf-8"?>`
      );
      xmlDoc = xmlDoc.replace(/\>[\s]+\</g, "><");
      // Forcing Express.js to not touch the charset of the buffer in order to remove charset=utf-8 as part of the content-type
      res.status(200).send(new Buffer(xmlDoc));
    });
  }

  public _transformContainerList(
    entities,
    includeMetadata,
    prefix,
    maxresults,
    marker
  ) {
    const xmlContainerListModel = new ContainerList();
    prefix === ""
      ? delete xmlContainerListModel.Prefix
      : (xmlContainerListModel.Prefix = prefix);
    maxresults === ""
      ? delete xmlContainerListModel.MaxResults
      : (xmlContainerListModel.MaxResults = maxresults);
    marker === ""
      ? delete xmlContainerListModel.Marker
      : (xmlContainerListModel.Marker = marker);
    // Fixme: We do not support markers yet
    delete xmlContainerListModel.NextMarker;
    for (const entity of entities) {
      if (entity.container.name === "$logs") {
        continue;
      }
      const modelContainer = new Container(entity.container.name);
      xmlContainerListModel.Containers.Container.push(modelContainer);
      if (
        !includeMetadata ||
        Object.keys(entity.container.metaProps).length === 0
      ) {
        delete modelContainer.Metadata;
      } else {
        modelContainer.Metadata = entity.container.metaProps;
      }
      modelContainer.Properties["Last-Modified"] = new Date(
        entity.meta.updated || entity.meta.created
      ).toUTCString();
      modelContainer.Properties.ETag = entity.container.etag;
      modelContainer.Properties.LeaseStatus = [
        "available",
        "broken",
        "expired"
      ].includes(entity.container.leaseState)
        ? "unlocked"
        : "locked";
      modelContainer.Properties.LeaseState = entity.container.leaseState;
      if (entity.container.leaseState === "leased") {
        modelContainer.Properties.LeaseDuration =
          entity.container.leaseDuration === -1 ? "infinite" : "fixed";
      } else {
        delete modelContainer.Properties.LeaseDuration;
      }
    }
    return xmlContainerListModel;
  }
}

export default new ListContainers();
