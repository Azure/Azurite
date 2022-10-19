import ITokenType from "./ITokenType";

export default class UnknownToken implements ITokenType {
  isUnknown(): boolean {
    return true;
  }
  isIdentifier(): boolean {
    return false;
  }
  isOperator(): boolean {
    return false;
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
