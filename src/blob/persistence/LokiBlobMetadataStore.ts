import IGCExtentProvider from "../../common/IGCExtentProvider";
import IBlobMetadataStore, {
  BlobModel,
  BlockModel,
  ContainerModel,
  IPersistencyChunk,
  ServicePropertiesModel
} from "./IBlobMetadataStore";

export default class LokiBlobMetadataStore
  implements IBlobMetadataStore, IGCExtentProvider {
  public createContainer(container: ContainerModel): Promise<ContainerModel> {
    throw new Error("Method not implemented.");
  }
  public setBlobHTTPHeaders(blob: BlobModel): Promise<BlobModel> {
    throw new Error("Method not implemented.");
  }
  public setBlobMetadata(blob: BlobModel): Promise<BlobModel> {
    throw new Error("Method not implemented.");
  }
  public getBlobProperties(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<BlobModel | undefined> {
    throw new Error("Method not implemented.");
  }
  public undeleteBlob(
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public commitBlockList(blockList: BlockModel[]): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public iteratorAllExtents(): AsyncIterator<string[]> {
    throw new Error("Method not implemented.");
  }
  public setServiceProperties<T extends ServicePropertiesModel>(
    serviceProperties: T
  ): Promise<T> {
    throw new Error("Method not implemented.");
  }
  public getServiceProperties<T extends ServicePropertiesModel>(
    account: string
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }
  public getContainerProperties<T extends ContainerModel>(
    account: string,
    container: string
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }
  public deleteContainer(account: string, container: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public setContainerMetadata<T extends ContainerModel>(
    container: T
  ): Promise<T> {
    throw new Error("Method not implemented.");
  }
  public listContainers<T extends ContainerModel>(
    account: string,
    prefix?: string | undefined,
    maxResults?: number | undefined,
    marker?: number | undefined
  ): Promise<[T[], number | undefined]> {
    throw new Error("Method not implemented.");
  }
  public deleteBlobs(account: string, container: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public createBlob<T extends BlobModel>(blob: T): Promise<T> {
    throw new Error("Method not implemented.");
  }
  public downloadBlob<T extends BlobModel>(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }
  public listBlobs<T extends BlobModel>(
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
  public deleteBlob(
    account: string,
    container: string,
    blob: string,
    snapshot?: string | undefined
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public stageBlock<T extends BlockModel>(block: T): Promise<T> {
    throw new Error("Method not implemented.");
  }
  public deleteAllBlocks(
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public insertBlocks<T extends BlockModel>(blocks: T[]): Promise<T[]> {
    throw new Error("Method not implemented.");
  }
  public getBlock<T extends BlockModel>(
    account: string,
    container: string,
    blob: string,
    block: string,
    isCommitted: boolean
  ): Promise<T | undefined> {
    throw new Error("Method not implemented.");
  }
  public getBlockList<T extends BlockModel>(
    account?: string | undefined,
    container?: string | undefined,
    blob?: string | undefined,
    isCommitted?: boolean | undefined
  ): Promise<T[]> {
    throw new Error("Method not implemented.");
  }
  public deletePayloads(
    persistency: Iterable<string | IPersistencyChunk>
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public init(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public isInitialized(): boolean {
    throw new Error("Method not implemented.");
  }
  public close(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  public isClosed(): boolean {
    throw new Error("Method not implemented.");
  }
}
