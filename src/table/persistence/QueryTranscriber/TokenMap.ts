import { QueryType } from "./QueryType";

export type TaggedToken = [string, TokenType];
export type TokenMap = [TaggedToken[], QueryType];
export enum TokenType {
  Unknown,
  Identifier,
  Comparisson,
  LogicalOp,
  Value,
  ParensOpen,
  ParensClose
}
