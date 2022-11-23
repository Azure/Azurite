import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

/**
 * Interface for Query Predicate State
 *
 * @export
 * @interface IQPState
 */
export default interface IQPState {
  name: QueryStateName;
  onProcess: (context: QueryContext) => QueryContext;
  onExit: (context: QueryContext) => QueryContext;
}
