import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

/**
 * Statemachine implementation for the Azurite query transcriber.
 *
 * @export
 * @class QueryTranscriber
 */
export default class QueryTranscriber {
  private queryContext: QueryContext;
  private states = new Map<QueryStateName, IQPState>();
  private currentState: IQPState;
  private isSwitchingState = false;

  public name: string;
  constructor(queryContext: QueryContext, name: string) {
    this.queryContext = queryContext;
    this.name = name ?? "machine";
    this.currentState = {
      name: QueryStateName.None,
      onProcess: (context: QueryContext) => {
        return context;
      },
      onExit: (context: QueryContext) => {
        return context;
      }
    };
  }

  isCurrentState(name: QueryStateName): boolean {
    return this.currentState?.name === name;
  }

  /**
   * Add a state to the machine.
   *
   * @param {string} name
   * @param {IQPState} state - The state to add.
   * @return {*}
   * @memberof LokiJsQueryTranscriber
   */
  addState(name: QueryStateName, config: IQPState) {
    this.states.set(name, {
      name,
      onProcess: config.onProcess?.bind(this.queryContext),
      onExit: config.onExit?.bind(this.queryContext)
    });

    return this;
  }

  /**
   * Switch to the state with the given name.
   *
   * @param {string} name,
   * @param {QueryContext} queryContext
   * @return {*}
   * @memberof LokiJsQueryTranscriber
   */
  setState(name: QueryStateName) {
    if (this.states.has(name) === false) {
      return;
    }

    if (this.isSwitchingState) {
      this.queryContext.stateQueue.push(name);
      return;
    }

    this.switchState(name);

    // processes state queue
    // if there is a problem with state transitions, recursive call of
    // setState will cause a stack overflow, which is OK:
    // as otherwise we would hang the process...
    while (this.queryContext.stateQueue.length > 0) {
      if (this.queryContext.stateQueue.length > 0) {
        const newState = this.queryContext.stateQueue.shift()!;
        this.setState(newState);
      }
    }
    this.currentState.onExit(this.queryContext);
    return this;
  }

  /**
   * switches states by exiting last state and processing new state
   *
   * @private
   * @param {QueryStateName} name
   * @memberof QueryTranscriber
   */
  private switchState(name: QueryStateName) {
    this.isSwitchingState = true;

    this.queryContext = this.currentState.onExit(this.queryContext);
    const state = this.states.get(name);

    this.checkState(state, name);
    this.queryContext = this.currentState.onProcess(this.queryContext);

    this.isSwitchingState = false;
  }

  private checkState(state: IQPState | undefined, name: QueryStateName) {
    if (state !== undefined) {
      this.currentState = state;
    } else {
      throw Error(`${this.name} does not have a state named ${name}`);
    }
  }

  /**
   * Returns the query transcribed by the state machine.
   *
   * @return {*}  {string}
   * @memberof LokiJsQueryTranscriber
   */
  getTranscribedQuery(): string {
    if (
      this.queryContext === undefined ||
      this.queryContext.transcribedQuery === ""
    ) {
      throw new Error("Query failed to be transcribed!");
    }
    return this.queryContext.transcribedQuery;
  }

  /**
   *
   *
   * @param {QueryStateName} name
   * @memberof LokiJsQueryTranscriber
   */
  setInitialState(name: QueryStateName) {
    this.queryContext.stateQueue.push(name);
  }
}
