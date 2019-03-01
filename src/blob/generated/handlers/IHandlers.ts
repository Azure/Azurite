// tslint:disable:ordered-imports
import IServiceHandler from "./IServiceHandler";
import IContainerHandler from "./IContainerHandler";
import IBlobHandler from "./IBlobHandler";
import IPageBlobHandler from "./IPageBlobHandler";
import IAppendBlobHandler from "./IAppendBlobHandler";
import IBlockBlobHandler from "./IBlockBlobHandler";

export interface IHandlers {
  serviceHandler: IServiceHandler;
  containerHandler: IContainerHandler;
  blobHandler: IBlobHandler;
  pageBlobHandler: IPageBlobHandler;
  appendBlobHandler: IAppendBlobHandler;
  blockBlobHandler: IBlockBlobHandler;
}
export default IHandlers;
