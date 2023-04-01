// tslint:disable:ordered-imports
import IServiceHandler from "./IServiceHandler";
import IFileSystemOperationsHandler from "./IFileSystemOperationsHandler";
import IPathOperationsHandler from "./IPathOperationsHandler";
import IContainerHandler from "./IContainerHandler";
import IBlobHandler from "./IBlobHandler";
import IPageBlobHandler from "./IPageBlobHandler";
import IAppendBlobHandler from "./IAppendBlobHandler";
import IBlockBlobHandler from "./IBlockBlobHandler";

export interface IHandlers {
  serviceHandler: IServiceHandler;
  fileSystemOperationsHandler: IFileSystemOperationsHandler;
  pathOperationsHandler: IPathOperationsHandler;
  containerHandler: IContainerHandler;
  blobHandler: IBlobHandler;
  pageBlobHandler: IPageBlobHandler;
  appendBlobHandler: IAppendBlobHandler;
  blockBlobHandler: IBlockBlobHandler;
}
export default IHandlers;
