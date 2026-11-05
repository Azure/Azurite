import IBlobEnvironment from "../blob/IBlobEnvironment";
import IQueueEnvironment from "../queue/IQueueEnvironment";
import ITableEnvironment from "../table/ITableEnvironment";
import IAccountModelEnvironment from "./IAccountModelEnvironment";

export default interface IEnvironment
  extends IBlobEnvironment,
  IQueueEnvironment,
  ITableEnvironment,
  IAccountModelEnvironment { }
