import { PredicateType } from "./PredicateType";

export type TaggedToken = [string, TokenType];
export type TokenMap = [TaggedToken[], PredicateType];
export enum TokenType {
  Unknown,
  Identifier,
  Comparisson,
  Operator,
  Value,
  ParensOpen,
  ParensClose
}
