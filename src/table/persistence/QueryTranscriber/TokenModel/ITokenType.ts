export default interface ITokenType {
  isUnknown(): boolean;
  isIdentifier(): boolean;
  isOperator(): boolean;
  isValue(): boolean;
  isParensOpen(): boolean;
  isParensClose(): boolean;
}
