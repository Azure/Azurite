// tslint:disable:ordered-imports
import ITableHandler from "./ITableHandler";
import IServiceHandler from "./IServiceHandler";

export interface IHandlers {
  tableHandler: ITableHandler;
  serviceHandler: IServiceHandler;
}
export default IHandlers;
