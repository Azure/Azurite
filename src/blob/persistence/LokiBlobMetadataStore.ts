import IGCExtentProvider from "../../common/IGCExtentProvider";
import IBlobMetadataStore, {
  BlobModel,
  BlockModel,
  ContainerModel,
  IPersistencyChunk,
  ServicePropertiesModel,
} from "./IBlobMetadataStore";

export default class LokiBlobMetadataStore
  implements IBlobMetadataStore, IGCExtentProvider {
  iteratorAllExtents(): AsyncIterator<string[]> {
    throw new Error("Method not implemented.");
  }
  updateServiceProperties<T extends ServicePropertiesModel>(
    serviceProperties: T
  ): Promise<T> {
    throw new Error("Method not implemented.");
  }
  getServiceProperties<T extends ServicePropertiesModel>(
    account: string
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }
  getContainer<T extends ContainerModel>(
    account: string,
    container: string
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }
  deleteContainer(account: string, container: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  updateContainer<T extends ContainerModel>(container: T): Promise<T> {
    throw new Error("Method not implemented.");
  }
  listContainers<T extends ContainerModel>(
    account: string,
    prefix?: string | undefined,
    maxResults?: number | undefined,
    marker?: number | undefined
  ): Promise<[T[], number | undefined]> {
    throw new Error("Method not implemented.");
  }
  deleteBlobs(account: string, container: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  updateBlob<T extends BlobModel>(blob: T): Promise<T> {
    throw new Error("Method not implemented.");
  }
  getBlob<T extends BlobModel>(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }
  listBlobs<T extends BlobModel>(
    account?: string | undefined,
    container?: string | undefined,
    blob?: string | undefined,
    prefix?: string | undefined,
    maxResults?: number | undefined,
    marker?: number | undefined,
    includeSnapshots?: boolean | undefined
  ): Promise<[T[], number | undefined]> {
    throw new Error("Method not implemented.");
  }
  deleteBlob(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  updateBlock<T extends BlockModel>(block: T): Promise<T> {
    throw new Error("Method not implemented.");
  }
  deleteBlocks(
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  insertBlocks<T extends BlockModel>(blocks: T[]): Promise<T[]> {
    throw new Error("Method not implemented.");
  }
  getBlock<T extends BlockModel>(
    account: string,
    container: string,
    blob: string,
    block: string,
    isCommitted: boolean
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }
  listBlocks<T extends BlockModel>(
    account?: string | undefined,
    container?: string | undefined,
    blob?: string | undefined,
    isCommitted?: boolean | undefined
  ): Promise<T[]> {
    throw new Error("Method not implemented.");
  }
  deletePayloads(
    persistency: Iterable<string | IPersistencyChunk>
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  init(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  isInitialized(): boolean {
    throw new Error("Method not implemented.");
  }
  close(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  isClosed(): boolean {
    throw new Error("Method not implemented.");
  }
}
