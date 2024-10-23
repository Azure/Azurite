import { IQueryContext } from "../IQueryContext";
import IQueryNode, { TagContent } from "./IQueryNode";

export default class KeyNode implements IQueryNode {
  constructor(private identifier: string) { }

  get name(): string {
    return "id"
  }

  evaluate(context: IQueryContext): TagContent[] {
    return [{
      key: this.identifier,
      value: context[this.identifier]
    }];
  }

  toString(): string {
    return this.identifier;
  }
}