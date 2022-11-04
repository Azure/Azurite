import ITokenType from "./ITokenType";

export default class IdentifierToken implements ITokenType {
  isUnknown(): boolean {
    return false;
  }
  isIdentifier(): boolean {
    return true;
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
