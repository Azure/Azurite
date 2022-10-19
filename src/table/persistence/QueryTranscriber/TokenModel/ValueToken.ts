import ITokenType from "./ITokenType";

export default class ValueToken implements ITokenType {
  isUnknown(): boolean {
    return false;
  }
  isIdentifier(): boolean {
    return false;
  }
  isOperator(): boolean {
    return false;
  }
  isValue(): boolean {
    return true;
  }
  isParensOpen(): boolean {
    return false;
  }
  isParensClose(): boolean {
    return false;
  }
}
