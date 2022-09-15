import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default interface IQPState {
  name: QueryStateName;
  onEnter: (context: QueryContext) => QueryContext;
  onUpdate: (context: QueryContext) => QueryContext;
  onExit: (context: QueryContext) => QueryContext;
}
