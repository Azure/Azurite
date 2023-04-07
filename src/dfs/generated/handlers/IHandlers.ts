// tslint:disable:ordered-imports
import IServiceHandler from "./IServiceHandler";
import IFileSystemOperationsHandler from "./IFileSystemOperationsHandler";
import IPathOperationsHandler from "./IPathOperationsHandler";
import IContainerHandler from "./IContainerHandler";
import IPageBlobHandler from "./IPageBlobHandler";
import IAppendBlobHandler from "./IAppendBlobHandler";
import IBlockBlobHandler from "./IBlockBlobHandler";
import IBlobHandler from "./IBlobHandler";

export interface IHandlers {
  serviceHandler: IServiceHandler;
  fileSystemOperationsHandler: IFileSystemOperationsHandler;
  pathOperationsHandler: IPathOperationsHandler;
  containerHandler: IContainerHandler;
  pageBlobHandler: IPageBlobHandler;
  appendBlobHandler: IAppendBlobHandler;
  blockBlobHandler: IBlockBlobHandler;
  blobHandler: IBlobHandler;
}
export default IHandlers;
