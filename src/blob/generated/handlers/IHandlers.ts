import IAppendBlobHandler from './IAppendBlobHandler';
import IBlobHandler from './IBlobHandler';
import IBlockBlobHandler from './IBlockBlobHandler';
import IContainerHandler from './IContainerHandler';
import IPageBlobHandler from './IPageBlobHandler';
// tslint:disable:ordered-imports
import IServiceHandler from './IServiceHandler';

export interface IHandlers {
  serviceHandler: IServiceHandler;
  containerHandler: IContainerHandler;
  blobHandler: IBlobHandler;
  pageBlobHandler: IPageBlobHandler;
  appendBlobHandler: IAppendBlobHandler;
  blockBlobHandler: IBlockBlobHandler;
}
export default IHandlers;
