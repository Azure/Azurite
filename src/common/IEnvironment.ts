import IBlobEnvironment from "../blob/IBlobEnvironment";
import IQueueEnvironment from "../queue/IQueueEnvironment";
import ITableEnvironment from "../table/ITableEnvironment";

export default interface IEnvironment
  extends IBlobEnvironment,
  IQueueEnvironment,
  ITableEnvironment { }
