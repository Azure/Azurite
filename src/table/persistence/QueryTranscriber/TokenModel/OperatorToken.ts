import ITokenType from "./ITokenType";

export default class OperatorToken implements ITokenType {
  isUnknown(): boolean {
    return false;
  }
  isIdentifier(): boolean {
    return false;
  }
  isOperator(): boolean {
    return true;
  }
  isValue(): boolean {
    return false;
  }
  isParensOpen(): boolean {
    return false;
  }
  isParensClose(): boolean {
    return false;
  }
}
