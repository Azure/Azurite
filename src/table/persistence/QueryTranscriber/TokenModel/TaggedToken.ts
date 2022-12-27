import ITokenType from "./ITokenType";

export default class TaggedToken {
  public token: string;
  public type: ITokenType;

  constructor(token: string, type: ITokenType) {
    this.token = token;
    this.type = type;
  }
}
