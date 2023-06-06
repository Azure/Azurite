import { IQueryContext } from "../IQueryContext";
import IQueryNode, { TagContent } from "./IQueryNode";

export default class ConstantNode implements IQueryNode {
  constructor(private value: string) { }

  get name(): string {
    return "constant"
  }

  evaluate(_context: IQueryContext): TagContent[] {
    return [{
      value: this.value
    }];
  }

  toString(): string {
    return JSON.stringify(this.value)
  }
}