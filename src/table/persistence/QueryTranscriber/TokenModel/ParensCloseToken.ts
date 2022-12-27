import ITokenType from "./ITokenType";

export default class ParensCloseToken implements ITokenType {
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
    return false;
  }
  isParensOpen(): boolean {
    return false;
  }
  isParensClose(): boolean {
    return true;
  }
}
