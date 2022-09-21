import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

// Statemachine implementation for the LokiJS query transcriber.
export default class LokiJsQueryTranscriber {
  // maybe rename context to data... or we need a data type for actions and transitions
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
      onEnter: (context: QueryContext) => {
        return context;
      },
      onUpdate: (context: QueryContext) => {
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
      onEnter: config.onEnter?.bind(this.queryContext),
      onUpdate: config.onUpdate?.bind(this.queryContext),
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

    this.isSwitchingState = true;

    if (this.isCurrentState(name)) {
      throw new Error(`${this.name} is already in state ${name}`);
    }

    this.queryContext = this.currentState.onExit(this.queryContext);
    const state = this.states.get(name);
    if (state !== undefined) {
      this.currentState = state;
    } else {
      throw Error(`${this.name} does not have a state named ${name}`);
    }
    this.queryContext = this.currentState.onEnter(this.queryContext);

    this.isSwitchingState = false;

    return this;
  }

  /**
   * Update the machine.
   *
   * @return {*}
   * @memberof LokiJsQueryTranscriber
   */
  update() {
    while (this.queryContext.stateQueue.length > 0) {
      if (this.queryContext.stateQueue.length > 0) {
        const name = this.queryContext.stateQueue.shift()!;
        this.setState(name);
      }

      if (this.currentState === undefined) {
        return;
      }

      this.currentState?.onUpdate?.(this.queryContext);
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
