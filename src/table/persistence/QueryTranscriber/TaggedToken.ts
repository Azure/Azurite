import { TokenType } from "./TokenType";

export default class TaggedToken {
  public token: string;
  public type: TokenType;

  constructor(token: string, type: TokenType) {
    this.token = token;
    this.type = type;
  }
}
