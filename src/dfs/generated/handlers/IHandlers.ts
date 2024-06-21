// tslint:disable:ordered-imports
import IServiceHandler from "./IServiceHandler";
import IFileSystemOperationsHandler from "./IFileSystemOperationsHandler";
import IPathOperationsHandler from "./IPathOperationsHandler";

export interface IHandlers {
  serviceHandler: IServiceHandler;
  fileSystemOperationsHandler: IFileSystemOperationsHandler;
  pathOperationsHandler: IPathOperationsHandler;
}
export default IHandlers;
