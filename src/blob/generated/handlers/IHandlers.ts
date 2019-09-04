import IAppendBlobHandler from "./IAppendBlobHandler";
// import IDirectoryHandler from "./IDirectoryHandler";
import IBlobHandler from "./IBlobHandler";
import IBlockBlobHandler from "./IBlockBlobHandler";
import IContainerHandler from "./IContainerHandler";
import IPageBlobHandler from "./IPageBlobHandler";
// tslint:disable:ordered-imports
import IServiceHandler from "./IServiceHandler";

export interface IHandlers {
  serviceHandler: IServiceHandler;
  containerHandler: IContainerHandler;
  // directoryHandler: IDirectoryHandler;
  blobHandler: IBlobHandler;
  pageBlobHandler: IPageBlobHandler;
  appendBlobHandler: IAppendBlobHandler;
  blockBlobHandler: IBlockBlobHandler;
}
export default IHandlers;
