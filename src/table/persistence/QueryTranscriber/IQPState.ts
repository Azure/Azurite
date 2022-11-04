import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default interface IQPState {
  name: QueryStateName;
  onProcess: (context: QueryContext) => QueryContext;
  onExit: (context: QueryContext) => QueryContext;
}
