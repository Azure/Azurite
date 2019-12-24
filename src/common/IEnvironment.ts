import IBlobEnvironment from "../blob/IBlobEnvironment";
import IQueueEnvironment from "../queue/IQueueEnvironment";

export default interface IEnvironment
  extends IBlobEnvironment,
    IQueueEnvironment {}
