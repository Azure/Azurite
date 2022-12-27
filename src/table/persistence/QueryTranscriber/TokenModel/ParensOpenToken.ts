import ITokenType from "./ITokenType";

export default class ParensOpenToken implements ITokenType {
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
    return true;
  }
  isParensClose(): boolean {
    return false;
  }
}
