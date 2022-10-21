/**
 * Token Type provides the capability to perform
 * tokenization and conversion based on value in query
 *
 * @export
 * @interface ITokenType
 */
export default interface ITokenType {
  isUnknown(): boolean;
  isIdentifier(): boolean;
  isOperator(): boolean;
  isValue(): boolean;
  isParensOpen(): boolean;
  isParensClose(): boolean;
}
